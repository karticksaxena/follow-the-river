import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import {
  add,
  builtinAOContext,
  diffuseColor,
  float,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  renderOutput,
  sample,
  screenUV,
  smoothstep,
  uniform,
  unpackRGBToNormal,
  vec4,
  velocity,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { createGrading, type GradePreset } from './grade';
import type { Tier } from './quality';

/** Horror look. Tuning knobs. */
export const POST = {
  /** Tone-mapping exposure (AgX). */
  exposure: 1,
  /** Glow around lamps, lit windows, the moon and the sun. */
  bloomStrength: 0.55,
  bloomRadius: 0.45,
  /** HDR: only pixels brighter than this glow. */
  bloomThreshold: 1,
  /** 0 = no dark edges; 1 = heavy tunnel vision. */
  vignette: 0.55,
  /** Film grain amount. */
  grain: 0.08,
  /** Ambient occlusion: resolution scale and radius in metres (Medium). */
  aoScale: 0.5,
  aoRadius: 0.6,
  /** Screen-space GI (High). */
  gi: { slices: 2, steps: 8, radius: 5, intensity: 6, aoIntensity: 1.5 },
  /** Depth of field in cutscenes. */
  focalLength: 4,
  bokeh: 3,
} as const;

export interface Post {
  /** Draws `scene` through the current tier's graph. */
  render(scene: THREE.Scene): void;
  /** Advances grade blends. */
  update(dt: number): void;
  /** Switches the graph (rebuilds once, never per frame); returns the tier in effect. */
  setTier(tier: Tier): Tier;
  /** Depth of field on/off for cutscenes; the first `on` compiles it (call behind a black fade). */
  focus(on: boolean, distance?: number): void;
  /** Colour grade, blended over `seconds`; returns the preset it left. */
  grade(preset: GradePreset, seconds?: number): GradePreset;
  dispose(): void;
}

interface Disposable {
  dispose(): void;
}

/** One tier's passes and the HDR colour they resolve to, before bloom and the output transform. */
interface Graph {
  passes: ReturnType<typeof pass>[];
  color: THREE.Node<'vec4'>;
  viewZ: THREE.Node<'float'>;
  /** Low has no TRAA, so SMAA runs on the tone-mapped picture. */
  smaa: boolean;
  owned: Disposable[];
}

interface Built {
  graph: Graph;
  gameplay: THREE.Node;
  cinematic: THREE.Node | null;
}

const asByte = (p: ReturnType<typeof pass>, name: string): void => {
  p.getTexture(name).type = THREE.UnsignedByteType;
};

function lowGraph(camera: THREE.PerspectiveCamera): Graph {
  const scenePass = pass(new THREE.Scene(), camera);
  return {
    passes: [scenePass],
    color: scenePass.getTextureNode('output'),
    viewZ: scenePass.getViewZNode(),
    smaa: true,
    owned: [scenePass],
  };
}

/** GTAO from a normal/velocity pre-pass feeds the scene's ambient term; TRAA resolves it. */
function mediumGraph(camera: THREE.PerspectiveCamera): Graph {
  const prePass = pass(new THREE.Scene(), camera);
  prePass.transparent = false;
  prePass.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));
  asByte(prePass, 'output');
  const normal = sample((uv) => unpackRGBToNormal(prePass.getTextureNode().sample(uv)));
  const depth = prePass.getTextureNode('depth');
  const occlusion = ao(depth, normal, camera);
  occlusion.resolutionScale = POST.aoScale;
  occlusion.radius.value = POST.aoRadius;
  const scenePass = pass(new THREE.Scene(), camera);
  scenePass.contextNode = builtinAOContext(occlusion.getTextureNode().sample(screenUV).r);
  const resolved = traa(scenePass, depth, prePass.getTextureNode('velocity'), camera);
  resolved.useSubpixelCorrection = false;
  return {
    passes: [prePass, scenePass],
    color: resolved,
    viewZ: scenePass.getViewZNode(),
    smaa: false,
    owned: [prePass, scenePass, occlusion, resolved],
  };
}

/** SSGI (AO + one bounce) from one MRT pass, then TRAA. */
function highGraph(camera: THREE.PerspectiveCamera): Graph {
  const scenePass = pass(new THREE.Scene(), camera);
  scenePass.setMRT(mrt({ output, diffuseColor, normal: packNormalToRGB(normalView), velocity }));
  asByte(scenePass, 'diffuseColor');
  asByte(scenePass, 'normal');
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const normal = sample((uv) => unpackRGBToNormal(scenePass.getTextureNode('normal').sample(uv)));
  const gi = ssgi(color, depth, normal, camera);
  gi.sliceCount.value = POST.gi.slices;
  gi.stepCount.value = POST.gi.steps;
  gi.radius.value = POST.gi.radius;
  gi.giIntensity.value = POST.gi.intensity;
  gi.aoIntensity.value = POST.gi.aoIntensity;
  const lit = vec4(
    add(
      color.rgb.mul(gi.getAONode()),
      scenePass.getTextureNode('diffuseColor').rgb.mul(gi.getGINode().rgb),
    ),
    color.a,
  );
  const resolved = traa(lit, depth, scenePass.getTextureNode('velocity'), camera);
  return {
    passes: [scenePass],
    color: resolved,
    viewZ: scenePass.getViewZNode(),
    smaa: false,
    owned: [scenePass, gi, resolved],
  };
}

const BUILD: Record<Tier, (camera: THREE.PerspectiveCamera) => Graph> = {
  low: lowGraph,
  medium: mediumGraph,
  high: highGraph,
};

/** Screen-space effects at full resolution. Works on WebGPU and WebGL 2 (TSL). */
export function createPost(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  start: Tier,
): Post {
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  const grading = createGrading('night');
  const focusAt = uniform(3);
  const webgpu = 'isWebGPUBackend' in renderer.backend;
  const edge = smoothstep(float(0.75), float(0.2), screenUV.sub(0.5).length());
  const dark = float(1).sub(float(POST.vignette).mul(float(1).sub(edge)));
  const grain = uniform(POST.grain);

  /** bloom, vignette, (depth of field), tone map, (SMAA), grade, grain. */
  const finish = (g: Graph, withDof: boolean): THREE.Node => {
    const glow = bloom(g.color, POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold);
    const lit = g.color.add(glow).mul(dark);
    const seen = withDof
      ? dof(lit, g.viewZ, focusAt, uniform(POST.focalLength), uniform(POST.bokeh))
      : lit;
    const display = renderOutput(seen);
    return film(grading.node(vec4(g.smaa ? smaa(display).getTextureNode() : display)), grain);
  };

  // SSGI is only trusted on WebGPU: the WebGL 2 backend gets the Medium graph instead.
  const allowed = (t: Tier): Tier => (!webgpu && t === 'high' ? 'medium' : t);
  let tier = allowed(start);
  let cinematic = false;
  const built = new Map<Tier, Built>();
  const current = (): Built => {
    let b = built.get(tier);
    if (!b) {
      const graph = BUILD[tier](camera);
      b = { graph, gameplay: finish(graph, false), cinematic: null };
      built.set(tier, b);
    }
    return b;
  };
  const apply = (): void => {
    const b = current();
    pipeline.outputNode = cinematic ? (b.cinematic ??= finish(b.graph, true)) : b.gameplay;
    pipeline.needsUpdate = true;
  };
  const release = (old: Built | undefined): void => {
    for (const n of old?.graph.owned ?? []) n.dispose();
  };
  apply();

  return {
    render(scene) {
      for (const p of current().graph.passes) p.scene = scene;
      pipeline.render();
    },
    update: (dt) => grading.update(dt),
    setTier(next) {
      const wanted = allowed(next);
      if (wanted === tier) return tier;
      const old = built.get(tier);
      built.delete(tier);
      tier = wanted;
      apply();
      release(old);
      return tier;
    },
    focus(on, distance) {
      if (distance !== undefined) focusAt.value = distance;
      if (on === cinematic) return;
      cinematic = on;
      apply();
    },
    grade: (preset, seconds) => grading.set(preset, seconds),
    dispose() {
      for (const b of built.values()) release(b);
      pipeline.dispose();
    },
  };
}
