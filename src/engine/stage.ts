import * as THREE from 'three/webgpu';
import { initEnvironment } from './environment';
import { capPeriod, newPacer, shouldRender, type MaxFps } from './frame-cap';
import { autoStartTier, readGpuInfo } from './gpu-class';
import type { GradePreset } from './grade';
import { createPerf, type Perf } from './perf';
import { createPost, POST } from './post';
import {
  adaptQuality,
  frameCost,
  isHitch,
  lowerTier,
  newQuality,
  pixelRatio,
  raiseTier,
  type Graphics,
  type Quality,
  type Tier,
} from './quality';
import { CAMERA_FAR } from './sky';
import { setSurfaceTier } from './surfaces';
import { clampDelta } from './time';
import { runUpdaters, type Updater } from './updaters';
import { NO_REFLECTION_LAYER } from './volume';

/** DEV: frames longer than this (s) are logged in `window.__kdLong`. */
const LONG_FRAME = 0.05;

export type Backend = 'webgpu' | 'webgl2';
export type { Updater } from './updaters';

export interface Stage {
  readonly renderer: THREE.WebGPURenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly backend: Backend;
  /** Adaptive resolution state (dev: `kd.stage.quality`). */
  readonly quality: Readonly<Quality>;
  /** The graph in use (Auto starts from the GPU and steps down). */
  readonly tier: Tier;
  /** Player's Graphics setting: a fixed tier, or `auto`. */
  setGraphics(graphics: Graphics): void;
  /** Frame cap from the pause menu. */
  setMaxFps(cap: MaxFps): void;
  /** Dev only: frame and GPU timing probe (`kd.perf.sample(10)`). */
  readonly perf?: Perf;
  /** Colour grade for the scene, blended over `seconds`; returns the preset it left. */
  grade(preset: GradePreset, seconds?: number): GradePreset;
  /** The mist box's material (its box is in the scene on the volume layer), or `null` to drop the pass. */
  mist(material: THREE.VolumeNodeMaterial | null): void;
  /** Depth of field for cutscenes (first `on` compiles: do it behind a black fade). */
  focus(on: boolean, distance?: number): void;
  /** Compiles the depth-of-field graph for one frame; call behind a black fade before a cutscene. */
  warmFocus(): void;
  /** True: the loop draws and updates nothing (the page stays responsive while `compileAsync` warms a scene behind black). */
  hold: boolean;
  /** True while a scene warms up behind black: the loop runs, but Auto quality ignores the (hitchy) frames. */
  warming: boolean;
  /** The scene being drawn; home and dreams swap it. */
  scene: THREE.Scene;
  /** Run `fn(dt)` every frame; call the returned function to stop. */
  addUpdater(fn: Updater): () => void;
  dispose(): void;
}

function fit(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  q: Quality,
  tier: Tier,
): void {
  renderer.setPixelRatio(pixelRatio(q, devicePixelRatio, tier));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
}

/** Creates the one renderer the whole app shares. `?webgl` in the URL forces the WebGL 2 backend. */
export async function createStage(container: HTMLElement): Promise<Stage> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  // GPU timestamp queries cost a little, so they are on only in dev with `?perf`.
  const trackTimestamp = import.meta.env.DEV && new URLSearchParams(location.search).has('perf');
  const gpuInfo = forceWebGL ? null : await readGpuInfo();
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL, trackTimestamp });
  await renderer.init();
  // The WebGL 2 fallback (forced, or no WebGPU) never starts at High; a software adapter starts at Low.
  const webgpu = 'isWebGPUBackend' in renderer.backend;
  const autoStart: Tier = webgpu ? autoStartTier(gpuInfo) : gpuInfo?.isFallback ? 'low' : 'medium';
  initEnvironment(renderer);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = POST.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, CAMERA_FAR);
  camera.layers.enable(NO_REFLECTION_LAYER);
  const quality = newQuality();
  let auto = true;
  let setting: Graphics = 'auto';
  let tier: Tier = autoStart;
  let cap: MaxFps = '90';
  const pacer = newPacer();
  const perf = import.meta.env.DEV ? createPerf(renderer) : undefined;
  const post = createPost(renderer, camera, tier);
  tier = post.setTier(tier);
  setSurfaceTier(tier);
  const updaters = new Set<Updater>();
  const timer = new THREE.Timer();
  timer.connect(document);
  const onResize = (): void => fit(renderer, camera, quality, tier);
  addEventListener('resize', onResize);
  onResize();
  const stage: Stage = {
    renderer,
    camera,
    backend: webgpu ? 'webgpu' : 'webgl2',
    scene: new THREE.Scene(),
    hold: false,
    warming: false,
    quality,
    get tier() {
      return tier;
    },
    setGraphics(graphics) {
      if (graphics === setting) return; // a volume slider save must not reset a tier Auto stepped down
      setting = graphics;
      auto = graphics === 'auto';
      tier = post.setTier(graphics === 'auto' ? autoStart : graphics);
      setSurfaceTier(tier);
      quality.since = 0;
      onResize(); // the tier sets the pixel-ratio cap
    },
    setMaxFps(next) {
      cap = next;
    },
    perf,
    grade: (preset, seconds) => post.grade(preset, seconds),
    mist: (material) => post.mist(material),
    focus: (on, distance) => post.focus(on, distance),
    warmFocus: () => post.warm(),
    addUpdater(fn) {
      updaters.add(fn);
      return () => {
        updaters.delete(fn);
      };
    },
    dispose() {
      void renderer.setAnimationLoop(null);
      removeEventListener('resize', onResize);
      timer.dispose();
      post.dispose();
      void renderer.dispose();
      renderer.domElement.remove();
    },
  };
  /** Resolution first, then (Auto only) the tier; each at most every `QUALITY.minGap` s. */
  const adapt = (dt: number, workMs: number): void => {
    const frameMs = frameCost(dt * 1000, workMs, capPeriod(cap) * 1000);
    const change = adaptQuality(quality, tier, auto, frameMs, dt, autoStart);
    if (change === 'tier') {
      tier = post.setTier(lowerTier(tier));
      setSurfaceTier(tier);
    }
    if (change === 'raise') {
      tier = post.setTier(raiseTier(tier));
      setSurfaceTier(tier);
    }
    if (change) onResize();
    // DEV marker in `__kdLong`: [-1, resolution step] for a resize, [-2, 0|1|2 = tier now] for a tier change (a rebuilt post graph).
    if (import.meta.env.DEV && change) {
      longFrames.push(
        change === 'res' ? [-1, quality.step] : [-2, ['low', 'medium', 'high'].indexOf(tier)],
      );
    }
  };
  // DEV: `window.__kdLong` lists every frame over LONG_FRAME as [time ms, frame ms] (hitches show up here).
  const longFrames: number[][] = [];
  if (import.meta.env.DEV) Object.assign(window, { __kdLong: longFrames });
  await renderer.setAnimationLoop((time) => {
    timer.update(time);
    if (!shouldRender(pacer, timer.getDelta(), cap)) return;
    if (stage.hold) return;
    perf?.begin(time);
    const start = performance.now();
    const dt = clampDelta(pacer.dt);
    runUpdaters(updaters, dt);
    post.update(dt);
    post.render(stage.scene);
    if (dt > 0 && !stage.warming && !isHitch(pacer.dt)) adapt(dt, performance.now() - start);
    if (import.meta.env.DEV && pacer.dt > LONG_FRAME) {
      longFrames.push([Math.round(time), Math.round(pacer.dt * 1000)]);
    }
    perf?.end();
  });
  return stage;
}
