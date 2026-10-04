import * as THREE from 'three/webgpu';
import { releaseEnvironment } from './environment';
import { detachKeyShadows } from './shadows';

function isCached(thing: { userData: Record<string, unknown> }): boolean {
  return thing.userData.cached === true;
}

function texturesOf(material: THREE.Material): THREE.Texture[] {
  return Object.values(material).filter((v): v is THREE.Texture => v instanceof THREE.Texture);
}

interface Drawable extends THREE.Object3D {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

function isDrawable(node: THREE.Object3D): node is Drawable {
  return node instanceof THREE.Mesh || node instanceof THREE.Sprite;
}

/**
 * Frees the GPU memory a scene owns: geometry, materials, their textures, skeletons and shadow maps.
 * Data loaded through `loadModel` is marked cached and shared by every clone, so it stays.
 */
export function disposeScene(root: THREE.Object3D): void {
  releaseEnvironment(root);
  const done = new Set<object>();
  const free = (thing: { dispose(): void; userData: Record<string, unknown> }): void => {
    if (done.has(thing) || isCached(thing)) return;
    done.add(thing);
    thing.dispose();
  };
  root.traverse((node) => {
    if (node instanceof THREE.DirectionalLight) detachKeyShadows(node);
    if (
      node instanceof THREE.Light &&
      'shadow' in node &&
      node.shadow instanceof THREE.LightShadow
    ) {
      node.shadow.dispose();
    }
    // Each SkeletonUtils clone has its own skeleton, whose bone texture lives on the GPU.
    if (node instanceof THREE.SkinnedMesh && !done.has(node.skeleton)) {
      done.add(node.skeleton);
      node.skeleton.dispose();
    }
    if (!isDrawable(node)) return;
    // three builds one geometry for every Sprite: freeing it left the next home screen's sprites
    // on a destroyed GPU buffer, every frame failed and the last game frame stayed on screen.
    if (!(node instanceof THREE.Sprite)) free(node.geometry);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!isCached(material)) for (const texture of texturesOf(material)) free(texture);
      free(material);
    }
  });
}
