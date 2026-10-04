import * as THREE from 'three/webgpu';
import type { GradePreset } from './grade';
import { createPost, POST } from './post';
import {
  adaptQuality,
  lowerTier,
  newQuality,
  pixelRatio,
  type Graphics,
  type Quality,
  type Tier,
} from './quality';
import { clampDelta } from './time';
import { runUpdaters, type Updater } from './updaters';

export type Backend = 'webgpu' | 'webgl2';
export type { Updater } from './updaters';

export interface Stage {
  readonly renderer: THREE.WebGPURenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly backend: Backend;
  /** Adaptive resolution state (dev: `kd.stage.quality`). */
  readonly quality: Readonly<Quality>;
  /** The graph in use (Auto starts at High and steps down). */
  readonly tier: Tier;
  /** Player's Graphics setting: a fixed tier, or `auto`. */
  setGraphics(graphics: Graphics): void;
  /** Colour grade for the scene, blended over `seconds`; returns the preset it left. */
  grade(preset: GradePreset, seconds?: number): GradePreset;
  /** Depth of field for cutscenes (first `on` compiles: do it behind a black fade). */
  focus(on: boolean, distance?: number): void;
  /** The scene being drawn; home and dreams swap it. */
  scene: THREE.Scene;
  /** Run `fn(dt)` every frame; call the returned function to stop. */
  addUpdater(fn: Updater): () => void;
  dispose(): void;
}

function fit(renderer: THREE.WebGPURenderer, camera: THREE.PerspectiveCamera, q: Quality): void {
  renderer.setPixelRatio(pixelRatio(q, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
}

/** Creates the one renderer the whole app shares. `?webgl` in the URL forces the WebGL 2 backend. */
export async function createStage(container: HTMLElement): Promise<Stage> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
  await renderer.init();
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = POST.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
  const quality = newQuality();
  let auto = true;
  let tier: Tier = 'high';
  const post = createPost(renderer, camera, tier);
  tier = post.setTier(tier);
  const updaters = new Set<Updater>();
  const timer = new THREE.Timer();
  timer.connect(document);
  const onResize = (): void => fit(renderer, camera, quality);
  addEventListener('resize', onResize);
  onResize();
  const stage: Stage = {
    renderer,
    camera,
    backend: 'isWebGPUBackend' in renderer.backend ? 'webgpu' : 'webgl2',
    scene: new THREE.Scene(),
    quality,
    get tier() {
      return tier;
    },
    setGraphics(graphics) {
      auto = graphics === 'auto';
      tier = post.setTier(graphics === 'auto' ? 'high' : graphics);
      quality.since = 0;
    },
    grade: (preset, seconds) => post.grade(preset, seconds),
    focus: (on, distance) => post.focus(on, distance),
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
  const adapt = (dt: number): void => {
    const change = adaptQuality(quality, tier, auto, dt * 1000, dt);
    if (change === 'tier') tier = post.setTier(lowerTier(tier));
    if (change) onResize();
  };
  await renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = clampDelta(timer.getDelta());
    runUpdaters(updaters, dt);
    post.update(dt);
    post.render(stage.scene);
    if (dt > 0) adapt(dt);
  });
  return stage;
}
