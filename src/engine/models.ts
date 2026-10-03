import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';

/**
 * Kenney's GLBs use KHR_materials_unlit, which GLTFLoader turns into MeshBasicMaterial —
 * those ignore lights, so the room would never go dark. Swap them for Lambert (cheap, PS1-like).
 */
export function litFrom(material: THREE.Material): THREE.Material {
  if (!(material instanceof THREE.MeshBasicMaterial)) return material;
  const lit = new THREE.MeshLambertMaterial({
    color: material.color,
    map: material.map,
    vertexColors: material.vertexColors,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
  });
  lit.name = material.name;
  return lit;
}

function isMesh(node: THREE.Object3D): node is THREE.Mesh {
  return node instanceof THREE.Mesh;
}

export function makeLit(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.material = Array.isArray(node.material)
        ? node.material.map(litFrom)
        : litFrom(node.material);
    }
  });
}

/** Every mesh in `root` casts and receives shadows (`cast` false: receive only). */
export function enableShadows(root: THREE.Object3D, cast = true): void {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.castShadow = cast;
      node.receiveShadow = true;
    }
  });
}

/** Flags geometry, materials and textures as shared cache data that `disposeScene` must keep. */
export function markCached(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!isMesh(node)) return;
    node.geometry.userData.cached = true;
    const materials: THREE.Material[] = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) {
      material.userData.cached = true;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.userData.cached = true;
      }
    }
  });
}

const loader = new GLTFLoader();
// Characters are meshopt-compressed (tools/assets/README.md); the decoder ships with three.
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Object3D>>();

/** Loads a .glb once (lit, shadowed); every call returns a fresh clone sharing geometry and materials. */
export async function loadModel(url: string): Promise<THREE.Object3D> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => {
      makeLit(gltf.scene);
      enableShadows(gltf.scene);
      markCached(gltf.scene);
      return gltf.scene;
    });
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return (await pending).clone(true);
}

export interface SkinnedAsset {
  scene: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}
const skinnedCache = new Map<string, Promise<SkinnedAsset>>();

/** Loads a skinned GLB once (marked cached); clone `scene` with SkeletonUtils.clone per character. */
export function loadSkinned(url: string): Promise<SkinnedAsset> {
  let pending = skinnedCache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => {
      enableShadows(gltf.scene, false);
      markCached(gltf.scene);
      return { scene: gltf.scene, clips: gltf.animations };
    });
    pending.catch(() => skinnedCache.delete(url));
    skinnedCache.set(url, pending);
  }
  return pending;
}
