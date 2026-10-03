import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { float, pass, screenUV, smoothstep, uniform } from 'three/tsl';
import * as THREE from 'three/webgpu';

/** Horror look. Tuning knobs. */
export const POST = {
  /** Glow around lamps, lit windows and the flashlight. */
  bloomStrength: 0.55,
  bloomRadius: 0.45,
  /** Only pixels brighter than this glow. */
  bloomThreshold: 0.7,
  /** 0 = no dark edges; 1 = heavy tunnel vision. */
  vignette: 0.85,
  /** Film grain amount. */
  grain: 0.18,
} as const;

export interface Post {
  /** Draws `scene` through bloom, vignette and grain. */
  render(scene: THREE.Scene): void;
  dispose(): void;
}

/** Screen-space effects on top of the low-res render. Works on WebGPU and WebGL 2 (TSL). */
export function createPost(renderer: THREE.WebGPURenderer, camera: THREE.Camera): Post {
  const scenePass = pass(new THREE.Scene(), camera);
  const color = scenePass.getTextureNode('output');
  const glow = bloom(color, POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold);
  const edge = smoothstep(float(0.75), float(0.2), screenUV.sub(0.5).length());
  const dark = float(1).sub(float(POST.vignette).mul(float(1).sub(edge)));
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputNode = film(color.add(glow).mul(dark), uniform(POST.grain));
  return {
    render(scene) {
      scenePass.scene = scene;
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
    },
  };
}
