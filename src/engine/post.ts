import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import {
  builtinAOContext,
  float,
  mrt,
  normalView,
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
import { createShafts, type Shafts } from './shafts';
import { VOLUME, VOLUME_LAYER, volumeSteps, type ShaftSource } from './volume';

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
  /** GTAO: radius in metres; Medium runs half resolution, High full resolution with more samples. */
  aoRadius: 0.6,
  ao: { medium: { scale: 0.5, samples: 16 }, high: { scale: 1, samples: 32 } },
  /** Depth of field in cutscenes. */
  focalLength: 4,
  bokeh: 3,
} as const;

export interface Post {
  /** Draws `scene` through the current tier's graph. */
  render(scene: THREE.Scene): void;
  /** Advances grade blends. */
  update(dt: number): void;
  /** Builds and compiles the depth-of-field graph for one frame, then goes back (call behind a black fade). */
  warm(): void;
  /** Switches the graph (rebuilds once, never per frame); returns the tier in effect. */
  setTier(tier: Tier): Tier;
  /** Depth of field on/off for cutscenes; the first `on` compiles it (call behind a black fade). */
  focus(on: boolean, distance?: number): void;
  /**
   * The raymarched mist (Medium and High on WebGPU): its box is in the scene on `VOLUME_LAYER`;
   * the graph rebuilds once. `null` takes the pass out again.
   */
  mist(material: THREE.VolumeNodeMaterial | null): void;
  /** God rays toward the sun: set `source` each frame (level 0 = off); the graph rebuilds once. `null` removes them. */
  shafts(source: ShaftSource | null): void;
  /** Colour grade, blended over `seconds`; returns the preset it left. */
  grade(preset: GradePreset, seconds?: number): GradePreset;
  dispose(): void;
}

export interface Disposable {
  dispose(): void;
}

/** Frees everything a built graph owned, once. */
export function disposeOwned(owned: Disposable[]): void {
  for (const n of owned.splice(0)) n.dispose();
}

/** One tier's passes and the HDR colour they resolve to, before bloom and the output transform. */
interface Graph {
  passes: ReturnType<typeof pass>[];
  color: THREE.Node<'vec4'>;
  viewZ: THREE.Node<'float'>;
  /** The pre-pass depth (Medium and High): the mist and the god rays read it. */
  depth?: THREE.TextureNode;
  /** Low has no TRAA, so SMAA runs on the tone-mapped picture. */
  smaa: boolean;
  owned: Disposable[];
  /** Set by `addLight` when the god rays are in the graph. */
  shafts?: Shafts;
}

interface Built {
  graph: Graph;
  /** Everything that owns GPU targets: the graph's nodes plus bloom, SMAA and DOF. */
  owned: Disposable[];
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
function aoGraph(
  camera: THREE.PerspectiveCamera,
  knobs: { scale: number; samples: number },
): Graph {
  const prePass = pass(new THREE.Scene(), camera);
  prePass.transparent = false; // mist, glow discs and sprites never write normals or velocity
  prePass.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));
  asByte(prePass, 'output');
  const normal = sample((uv) => unpackRGBToNormal(prePass.getTextureNode().sample(uv)));
  const depth = prePass.getTextureNode('depth');
  const occlusion = ao(depth, normal, camera);
  occlusion.resolutionScale = knobs.scale;
  occlusion.samples.value = knobs.samples;
  occlusion.radius.value = POST.aoRadius;
  const scenePass = pass(new THREE.Scene(), camera);
  scenePass.contextNode = builtinAOContext(occlusion.getTextureNode().sample(screenUV).r);
  const resolved = traa(scenePass, depth, prePass.getTextureNode('velocity'), camera);
  resolved.useSubpixelCorrection = false;
  return {
    passes: [prePass, scenePass],
    color: resolved,
    viewZ: scenePass.getViewZNode(),
    depth,
    smaa: false,
    owned: [prePass, scenePass, occlusion, resolved],
  };
}

const BUILD: Record<Tier, (camera: THREE.PerspectiveCamera) => Graph> = {
  low: lowGraph,
  medium: (camera) => aoGraph(camera, POST.ao.medium),
  high: (camera) => aoGraph(camera, POST.ao.high),
};

/** Screen-space effects at full resolution. Works on WebGPU and WebGL 2 (TSL). */
export function createPost(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  start: Tier,
): Post {
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  const grading = createGrading('night', POST.bloomStrength);
  const focusAt = uniform(3);
  const webgpu = 'isWebGPUBackend' in renderer.backend;
  const noMist = import.meta.env.DEV && new URLSearchParams(location.search).has('nomist');
  const volumeLayers = new THREE.Layers();
  volumeLayers.disableAll();
  volumeLayers.enable(VOLUME_LAYER);
  let mistMaterial: THREE.VolumeNodeMaterial | null = null;
  let shaftSource: ShaftSource | null = null;
  const edge = smoothstep(float(0.75), float(0.2), screenUV.sub(0.5).length());
  const dark = float(1).sub(float(POST.vignette).mul(float(1).sub(edge)));
  const grain = uniform(POST.grain);

  /** bloom, vignette, (depth of field), tone map, (SMAA), grade, grain. Nodes with targets go to `owned`. */
  const finish = (g: Graph, withDof: boolean, owned: Disposable[]): THREE.Node => {
    const glow = bloom(g.color, grading.bloom, POST.bloomRadius, POST.bloomThreshold);
    owned.push(glow);
    const lit = g.color.add(glow).mul(dark);
    let seen: THREE.Node = lit;
    if (withDof) {
      const blur = dof(lit, g.viewZ, focusAt, uniform(POST.focalLength), uniform(POST.bokeh));
      owned.push(blur);
      seen = blur;
    }
    const display = renderOutput(seen);
    let shown = vec4(display);
    if (g.smaa) {
      const edges = smaa(display);
      owned.push(edges);
      shown = vec4(edges.getTextureNode());
    }
    return film(grading.node(shown), grain);
  };

  /** The mist and the god rays, added to the resolved HDR colour (they have nothing on Low). */
  const addLight = (g: Graph, steps: number, owned: Disposable[]): void => {
    if (!g.depth) return;
    let extra: THREE.Node<'vec3'> | null = null;
    if (mistMaterial && steps > 0) {
      const volume = pass(new THREE.Scene(), camera, { depthBuffer: false });
      volume.setLayers(volumeLayers);
      volume.setResolutionScale(VOLUME.resolutionScale);
      mistMaterial.steps = steps;
      mistMaterial.depthNode = g.depth.sample(screenUV);
      mistMaterial.needsUpdate = true;
      const blurred = gaussianBlur(volume, float(VOLUME.blurRadius), VOLUME.blurSigma);
      g.passes.push(volume);
      owned.push(volume, blurred);
      extra = blurred.rgb.mul(VOLUME.strength).min(VOLUME.cap);
    }
    if (shaftSource) {
      g.shafts = createShafts(g.depth);
      extra = extra ? extra.add(g.shafts.node) : g.shafts.node;
    }
    if (extra) g.color = g.color.add(vec4(extra, 0));
  };

  // High is only trusted on WebGPU: the WebGL 2 backend gets the Medium graph instead.
  const allowed = (t: Tier): Tier => (!webgpu && t === 'high' ? 'medium' : t);
  let tier = allowed(start);
  let cinematic = false;
  const built = new Map<Tier, Built>();
  const current = (): Built => {
    let b = built.get(tier);
    if (!b) {
      const graph = BUILD[tier](camera);
      const owned = [...graph.owned];
      addLight(graph, noMist ? 0 : volumeSteps(tier, webgpu), owned);
      b = { graph, owned, gameplay: finish(graph, false, owned), cinematic: null };
      built.set(tier, b);
    }
    return b;
  };
  const apply = (): void => {
    const b = current();
    pipeline.outputNode = cinematic ? (b.cinematic ??= finish(b.graph, true, b.owned)) : b.gameplay;
    pipeline.needsUpdate = true;
  };
  const release = (old: Built | undefined): void => {
    if (old) disposeOwned(old.owned);
  };
  /** Builds every graph again (the mist or the rays came or went), then frees the old ones. */
  const rebuild = (): void => {
    const old = [...built.values()];
    built.clear();
    apply();
    for (const b of old) release(b);
  };
  let warming = 0;
  apply();

  return {
    render(scene) {
      for (const p of current().graph.passes) p.scene = scene;
      if (shaftSource) current().graph.shafts?.update(shaftSource, camera);
      pipeline.render();
      if (warming > 0 && --warming === 0) {
        cinematic = false;
        apply();
      }
    },
    warm() {
      cinematic = true;
      warming = 2;
      apply();
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
    mist(material) {
      if (material === mistMaterial) return;
      mistMaterial = material;
      rebuild();
    },
    shafts(source) {
      if ((source === null) === (shaftSource === null)) {
        shaftSource = source;
        return;
      }
      shaftSource = source;
      rebuild();
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
