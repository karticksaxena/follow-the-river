import * as THREE from 'three/webgpu';
import { assetUrl } from '../../engine/assets';
import { loadModel } from '../../engine/models';
import type { Tier } from '../../engine/quality';
import { GRASS, isTree, type Plant } from './vegetation';
import { SCALE_ATTRIBUTE, WIND, windNode, type Fade, type WindLook } from './wind';

type Category = 'trees' | 'trees-far' | 'plants' | 'grass' | 'rocks';

/** One InstancedMesh never spans more than this many metres (as in engine/batch.ts): frustum culling still works. */
const CELL = 48;
/** Leaf and grass cut-outs: a harder edge than the file's 0.2 keeps the cards from looking fuzzy. */
const ALPHA_TEST = 0.5;
/** MegaKit's PBR is shiny; the dream is matte. */
const MIN_ROUGHNESS = 0.9;
/**
 * Muted colour multipliers (sRGB hex) by material name: the pack is bright and green, the dream is
 * dark and dead. First match wins; no match leaves the texture as it is. Tuning knobs.
 */
const TINTS: readonly (readonly [RegExp, number])[] = [
  [/pine/i, 0x7d8a78],
  [/leaves|grass/i, 0x879070],
  [/flower/i, 0x707070],
  [/bark/i, 0xa59d92],
];

const categoryOf = (p: Plant): Category =>
  isTree(p.model)
    ? p.far
      ? 'trees-far'
      : 'trees'
    : p.model.startsWith('Grass')
      ? 'grass'
      : /^(Rock|Pebble)/.test(p.model)
        ? 'rocks'
        : 'plants';

interface Part {
  geometry: THREE.BufferGeometry;
  source: THREE.Material;
}

const categories = new Map<Category, Promise<THREE.Object3D>>();
const parts = new Map<string, Promise<Part[]>>();
const materials = new Map<string, THREE.Material>();

function loadCategory(category: Category): Promise<THREE.Object3D> {
  let pending = categories.get(category);
  if (!pending) {
    pending = loadModel(assetUrl(`kits/megakit/${category}.glb`));
    pending.catch(() => categories.delete(category));
    categories.set(category, pending);
  }
  return pending;
}

const ATTRIBUTES = ['position', 'normal', 'uv', 'color'] as const;

/** A float copy of a quantized mesh's geometry, baked through its node's world matrix (metres). */
function bake(mesh: SingleMaterialMesh): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ATTRIBUTES) {
    const a = mesh.geometry.getAttribute(name);
    if (!a) continue;
    const data = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < a.itemSize; c++) data[i * a.itemSize + c] = a.getComponent(i, c);
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, a.itemSize));
  }
  out.setIndex(mesh.geometry.index);
  out.applyMatrix4(mesh.matrixWorld);
  return out;
}

type SingleMaterialMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

function isSingleMaterialMesh(node: THREE.Object3D): node is SingleMaterialMesh {
  return node instanceof THREE.Mesh && !Array.isArray(node.material);
}

/** Every primitive of one model (a node of the category GLB): bark and leaves are separate meshes. */
function partsOf(category: Category, model: string): Promise<Part[]> {
  const key = `${category}/${model}`;
  let pending = parts.get(key);
  if (!pending) {
    pending = loadCategory(category).then((scene) => {
      const node = scene.getObjectByName(model);
      if (!node) throw new Error(`MegaKit ${category} has no model ${model}`);
      scene.updateMatrixWorld(true);
      const found: Part[] = [];
      node.traverse((child) => {
        if (isSingleMaterialMesh(child))
          found.push({ geometry: bake(child), source: child.material });
      });
      return found;
    });
    pending.catch(() => parts.delete(key));
    parts.set(key, pending);
  }
  return pending;
}

/** How a material sways (null: stays still: bark, rocks). */
function windOf(category: Category, name: string): WindLook | null {
  if (category === 'grass') return WIND.grass;
  if (category === 'plants') return WIND.plant;
  return category !== 'rocks' && /leaves/i.test(name) ? WIND.tree : null;
}

/** A muted, matte, alpha-tested copy of a PBR material as a node material, swaying if `look`. */
function foliage(
  s: THREE.MeshStandardMaterial,
  look: WindLook | null,
  fade?: Fade,
): THREE.Material {
  const tint = TINTS.find(([pattern]) => pattern.test(s.name))?.[1];
  const material = new THREE.MeshStandardNodeMaterial({
    name: s.name,
    map: s.map,
    normalMap: s.normalMap,
    color: tint ?? 0xffffff,
    vertexColors: s.vertexColors,
    roughness: Math.max(s.roughness, MIN_ROUGHNESS),
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: s.alphaTest > 0 ? ALPHA_TEST : 0,
  });
  if (look) material.positionNode = windNode(look, fade);
  material.userData.cached = true; // shared by every scene: disposeScene keeps it
  return material;
}

/** One shared, never-freed node material per (source, category, tier). */
function materialFor(source: THREE.Material, category: Category, tier: Tier): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source;
  const look = windOf(category, source.name);
  const key = `${source.uuid}|${category}|${look ? tier : ''}`;
  let material = materials.get(key);
  if (!material) {
    material = foliage(source, look, category === 'grass' ? GRASS[tier].fade : undefined);
    materials.set(key, material);
  }
  return material;
}

/** A mesh's own geometry sharing the baked buffers, plus its per-instance scale. */
function instancedGeometry(base: THREE.BufferGeometry, scales: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ATTRIBUTES) {
    const a = base.getAttribute(name);
    if (a) g.setAttribute(name, a);
  }
  g.setIndex(base.index);
  g.setAttribute(SCALE_ATTRIBUTE, new THREE.InstancedBufferAttribute(scales, 1));
  return g;
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scaling = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface Group {
  category: Category;
  model: string;
  plants: Plant[];
}

function groupPlants(plants: readonly Plant[]): Group[] {
  const groups = new Map<string, Group>();
  for (const p of plants) {
    const category = categoryOf(p);
    const key = `${category}|${p.model}|${Math.floor(p.x / CELL)}|${Math.floor(p.z / CELL)}`;
    const group = groups.get(key);
    if (group) group.plants.push(p);
    else groups.set(key, { category, model: p.model, plants: [p] });
  }
  return [...groups.values()];
}

function instances(part: Part, g: Group, tier: Tier): THREE.InstancedMesh {
  const scales = new Float32Array(g.plants.length);
  const matrices = new Float32Array(g.plants.length * 16);
  g.plants.forEach((p, i) => {
    quaternion.setFromAxisAngle(UP, p.yaw);
    matrix.compose(position.set(p.x, p.y, p.z), quaternion, scaling.setScalar(p.scale));
    matrices.set(matrix.elements, i * 16);
    scales[i] = p.scale;
  });
  const mesh = new THREE.InstancedMesh(
    instancedGeometry(part.geometry, scales),
    materialFor(part.source, g.category, tier),
    g.plants.length,
  );
  mesh.instanceMatrix.array.set(matrices);
  // Near trees and rocks cast (no shadows at all on Low); grass and ferns neither cast nor receive.
  const solid = g.category === 'trees' || g.category === 'rocks';
  mesh.castShadow = solid && tier !== 'low';
  mesh.receiveShadow = solid || g.category === 'trees-far';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Adds MegaKit trees, plants, grass and rocks to `parent` as instanced meshes: one per
 * (model, primitive, 48 m map cell), so a view draws a few dozen. Placements are world-space (the
 * meshes sit at the origin); `y` is the ground height under each. Trees sway by their leaves,
 * grass thins out with distance per `tier`.
 */
export async function addVegetation(
  parent: THREE.Object3D,
  plants: readonly Plant[],
  tier: Tier,
): Promise<void> {
  const groups = groupPlants(plants);
  const all = await Promise.all(groups.map((g) => partsOf(g.category, g.model)));
  groups.forEach((g, i) => {
    for (const part of all[i]) parent.add(instances(part, g, tier));
  });
}
