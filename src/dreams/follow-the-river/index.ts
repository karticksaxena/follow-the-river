import * as THREE from 'three/webgpu';
import type { DreamModule } from '../types';

// Temporary (Task 8): an empty world so the registry has something to load. Task 9 replaces it.
export function createDream(): DreamModule {
  return {
    start(ctx) {
      ctx.stage.scene = new THREE.Scene();
      return Promise.resolve();
    },
    dispose() {
      // Nothing to clean up yet.
    },
  };
}
