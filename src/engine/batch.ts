import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';

/** Metres per spatial cell: a merged mesh never spans more, so frustum culling still works. */
const CELL = 48;

type Batchable = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

function isBatchable(node: THREE.Object3D): node is Batchable {
  return (
    node instanceof THREE.Mesh &&
    !(node instanceof THREE.InstancedMesh) &&
    !(node instanceof THREE.SkinnedMesh) &&
    !Array.isArray(node.material)
  );
}

/** Roots made only of plain single-material meshes can be batched; others stay as they are. */
function canBatch(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && !isBatchable(node)) ok = false;
  });
  return ok;
}

/** Everything that changes how a mesh looks or is shadowed: equal keys can share one material. */
function groupKey(mesh: Batchable, cell: number): string {
  const m = mesh.material;
  const map = 'map' in m && m.map instanceof THREE.Texture ? m.map.source.uuid : '';
  const color = 'color' in m && m.color instanceof THREE.Color ? m.color.getHex() : 0;
  const vertexColors = 'vertexColors' in m ? String(m.vertexColors) : '';
  const cx = Math.floor(mesh.matrixWorld.elements[12] / cell);
  const cz = Math.floor(mesh.matrixWorld.elements[14] / cell);
  return [
    m.type,
    map,
    color,
    vertexColors,
    m.side,
    m.transparent,
    m.opacity,
    m.alphaTest,
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.layers.mask,
    cx,
    cz,
  ].join('|');
}

/** Attribute names every geometry has: merging needs identical sets. */
function commonAttributes(geometries: THREE.BufferGeometry[]): string[] {
  const [first, ...rest] = geometries;
  return Object.keys(first.attributes).filter((name) =>
    rest.every((g) => g.attributes[name] !== undefined),
  );
}

/** A private copy of the geometry, baked into world space, with only the shared attributes. */
function bake(mesh: Batchable, names: string[], indexed: boolean): THREE.BufferGeometry {
  let g = mesh.geometry.clone();
  g.userData = {};
  for (const name of Object.keys(g.attributes)) {
    if (!names.includes(name)) g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(mesh.matrixWorld);
  if (!indexed && g.index) g = g.toNonIndexed();
  return g;
}

/** An unshared copy of the first material (so disposeScene may free it); textures stay shared. */
function privateMaterial(material: THREE.Material): THREE.Material {
  const copy = material.clone();
  delete copy.userData.cached;
  return copy;
}

function mergeGroup(meshes: Batchable[]): THREE.Mesh[] {
  const names = commonAttributes(meshes.map((m) => m.geometry));
  const indexed = meshes.every((m) => m.geometry.index !== null);
  const baked = meshes.map((m) => bake(m, names, indexed));
  const material = privateMaterial(meshes[0].material);
  const merged = baked.length > 1 ? mergeGeometries(baked, false) : baked[0];
  const geometries = merged ? [merged] : baked;
  if (merged && baked.length > 1) for (const g of baked) g.dispose();
  return geometries.map((geometry) => {
    const out = new THREE.Mesh(geometry, material);
    out.castShadow = meshes[0].castShadow;
    out.receiveShadow = meshes[0].receiveShadow;
    out.layers.mask = meshes[0].layers.mask;
    out.matrixAutoUpdate = false;
    return out;
  });
}

/**
 * Adds static prop roots to `parent`, merging their meshes into one mesh per
 * (look, shadow flags, layers, map cell of `cell` m; far static rows pass a big one). Roots are not added themselves; roots holding skinned,
 * instanced or multi-material meshes are added untouched. Cached templates are never modified:
 * merged geometry and materials are new and owned by the scene.
 */
export function addBatched(parent: THREE.Object3D, roots: THREE.Object3D[], cell = CELL): void {
  const groups = new Map<string, Batchable[]>();
  for (const root of roots) {
    if (!canBatch(root)) {
      parent.add(root);
      continue;
    }
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (!isBatchable(node)) return;
      const key = groupKey(node, cell);
      const list = groups.get(key);
      if (list) list.push(node);
      else groups.set(key, [node]);
    });
  }
  for (const meshes of groups.values()) parent.add(...mergeGroup(meshes));
}

/**
 * One mesh per material for a multi-part template, in the template's own space (its root transform
 * is kept, so the result still spins and moves as a unit). Clones of the result share the geometry:
 * a pickup of 3-4 parts becomes 1 draw per material. Roots with skinned or multi-material meshes
 * come back unchanged.
 */
export function mergeParts(root: THREE.Object3D): THREE.Object3D {
  if (!canBatch(root)) return root;
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, Batchable[]>();
  root.traverse((node) => {
    if (!isBatchable(node)) return;
    const key = groupKey(node, Infinity);
    const list = groups.get(key);
    if (list) list.push(node);
    else groups.set(key, [node]);
  });
  const out = new THREE.Group();
  out.name = root.name;
  out.position.copy(root.position);
  out.quaternion.copy(root.quaternion);
  out.scale.copy(root.scale);
  for (const meshes of groups.values()) {
    const local = meshes.map((m) => {
      const copy = new THREE.Mesh(m.geometry, m.material);
      copy.castShadow = m.castShadow;
      copy.receiveShadow = m.receiveShadow;
      copy.matrixWorld.multiplyMatrices(inverse, m.matrixWorld);
      return copy;
    });
    for (const mesh of mergeGroup(local)) {
      mesh.geometry.userData.cached = true; // shared by every clone: disposeScene must keep it
      for (const m of [mesh.material].flat()) m.userData.cached = true;
      out.add(mesh);
    }
  }
  return out;
}
