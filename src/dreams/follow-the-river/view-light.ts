import { lights } from 'three/tsl';
import * as THREE from 'three/webgpu';

/** Seconds between looks at the scene's light set (it changes only with the phase, a campfire or a lamp). */
const REFRESH = 0.5;

/** The scene's visible lights except the torch (a SpotLight held on the camera): a viewmodel is lit by the world, never by it. */
export function viewLights(root: THREE.Object3D, camera: THREE.Object3D): THREE.Light[] {
  const found: THREE.Light[] = [];
  root.traverseVisible((n) => {
    if (n instanceof THREE.Light && !(n instanceof THREE.SpotLight && n.parent === camera)) {
      found.push(n);
    }
  });
  return found;
}

const sameLights = (a: readonly THREE.Light[], b: readonly THREE.Light[]): boolean =>
  a.length === b.length && a.every((l, i) => l === b[i]);

export interface ViewLights {
  /** For `material.lightsNode`: only these lights reach the material. */
  readonly node: ReturnType<typeof lights>;
  /** Re-reads the scene's lights now and then; the shader is rebuilt only when the set really changed. */
  update(dt: number): void;
}

const made = new WeakMap<THREE.Object3D, ViewLights>();

/** One light set per camera, shared by the bow and the guns. */
export function viewLightsFor(camera: THREE.Object3D): ViewLights {
  let v = made.get(camera);
  if (!v) {
    const node = lights([]);
    let wait = 0;
    v = {
      node,
      update(dt) {
        wait -= dt;
        if (wait > 0) return;
        wait = REFRESH;
        let root = camera;
        while (root.parent) root = root.parent;
        const next = viewLights(root, camera);
        if (!sameLights(node.getLights(), next)) node.setLights(next);
      },
    };
    made.set(camera, v);
  }
  return v;
}

/** A node-lit copy of a glTF standard material that takes its light from `node` alone. */
function lit(source: unknown, node: ViewLights['node']): THREE.Material | null {
  if (!(source instanceof THREE.MeshStandardMaterial)) return null;
  const m = new THREE.MeshStandardNodeMaterial({
    color: source.color,
    map: source.map,
    vertexColors: source.vertexColors,
    roughness: source.roughness,
    metalness: source.metalness,
    side: source.side,
    transparent: source.transparent,
    opacity: source.opacity,
  });
  m.name = source.name;
  m.lightsNode = node;
  m.userData.cached = true; // shared by every mesh of this viewmodel
  return m;
}

/** Re-lights every mesh under a viewmodel so the torch cannot blow it out. Materials are copied, the loaded ones stay untouched. */
export function lightViewmodel(root: THREE.Object3D, node: ViewLights['node']): void {
  const copies = new Map<unknown, THREE.Material | null>();
  root.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    const source: unknown = n.material;
    if (!copies.has(source)) copies.set(source, lit(source, node));
    const copy = copies.get(source);
    if (copy) n.material = copy;
  });
}
