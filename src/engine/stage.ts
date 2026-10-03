import * as THREE from 'three/webgpu';
import { createPost } from './post';
import { internalResolution } from './resolution';
import { clampDelta } from './time';

/** Rows rendered per frame before upscaling. Lower = chunkier, retro look. Tuning knob. */
export const RENDER_HEIGHT = 540;

export type Backend = 'webgpu' | 'webgl2';
export type Updater = (dt: number) => void;

export interface Stage {
  readonly renderer: THREE.WebGPURenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly backend: Backend;
  /** The scene being drawn; home and dreams swap it. */
  scene: THREE.Scene;
  /** Run `fn(dt)` every frame; call the returned function to stop. */
  addUpdater(fn: Updater): () => void;
  dispose(): void;
}

function fit(renderer: THREE.WebGPURenderer, camera: THREE.PerspectiveCamera): void {
  const { width, height } = internalResolution(innerWidth, innerHeight, RENDER_HEIGHT);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/** Creates the one renderer the whole app shares. `?webgl` in the URL forces the WebGL 2 backend. */
export async function createStage(container: HTMLElement): Promise<Stage> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
  const post = createPost(renderer, camera);
  const updaters = new Set<Updater>();
  const timer = new THREE.Timer();
  timer.connect(document);
  const onResize = (): void => fit(renderer, camera);
  addEventListener('resize', onResize);
  onResize();
  const stage: Stage = {
    renderer,
    camera,
    backend: 'isWebGPUBackend' in renderer.backend ? 'webgpu' : 'webgl2',
    scene: new THREE.Scene(),
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
  await renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = clampDelta(timer.getDelta());
    for (const fn of updaters) fn(dt);
    post.render(stage.scene);
  });
  return stage;
}
