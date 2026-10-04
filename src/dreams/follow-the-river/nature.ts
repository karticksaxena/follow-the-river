import * as THREE from 'three/webgpu';
import { assetUrl } from '../../engine/assets';
import { loadModel } from '../../engine/models';
import type { Tier } from '../../engine/quality';
import { NO_REFLECTION_LAYER } from '../../engine/volume';
import {
  builtModel,
  farTree,
  GRASS,
  isTree,
  REACH,
  visible,
  type Kind,
  type Plant,
} from './vegetation';
import { SCALE_ATTRIBUTE, WIND, windNode, type Fade, type WindLook } from './wind';

type Category = 'trees' | 'trees-far' | 'plants' | 'grass' | 'rocks';

/** A plant to build, with how it is shown (see `visible`). */
interface Item {
  plant: Plant;
  kind: Kind;
}

/** The river runs along z: vegetation is built in cells this many metres long (z), one mesh per model each. */
const CELL = 60;
/** Trees with no near twin (far from the path, or any tree on Low) are built in longer cells: far fewer meshes. */
const FAR_CELL = 120;
/** Crowns reach past their trunks: a cell's box grows by this much (m). */
const CROWN = 6;
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
  kind: Kind;
  model: string;
  plants: Plant[];
}

/**
 * What to build for each plant on `tier`: near trees get a near mesh and a thinned twin (shown
 * past the near reach); trees already far, and every tree on Low, are thinned only.
 */
function itemsFor(plants: readonly Plant[], tier: Tier): Item[] {
  const items: Item[] = [];
  for (const original of plants) {
    const plant = { ...original, model: builtModel(original.model) };
    if (isTree(plant.model)) {
      const far = { ...plant, model: farTree(plant.model), far: true };
      if (plant.far || REACH.nearTree[tier] === 0) items.push({ plant: far, kind: 'farOnly' });
      else items.push({ plant, kind: 'near' }, { plant: far, kind: 'far' });
    } else {
      const kind = plant.model.startsWith('Grass') ? 'grass' : 'small';
      items.push({ plant, kind });
    }
  }
  return items;
}

function groupItems(items: readonly Item[]): Group[] {
  const groups = new Map<string, Group>();
  for (const { plant, kind } of items) {
    const category = categoryOf(plant);
    const cell = kind === 'farOnly' ? FAR_CELL : CELL;
    const key = `${kind}|${category}|${plant.model}|${Math.floor(plant.z / cell)}`;
    const group = groups.get(key);
    if (group) group.plants.push(plant);
    else groups.set(key, { category, kind, model: plant.model, plants: [plant] });
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
  const tree = g.category === 'trees' || g.category === 'trees-far';
  const solid = g.category === 'trees' || g.category === 'rocks';
  // Near trees and rocks cast shadows on High only; grass and ferns neither cast nor receive.
  mesh.castShadow = solid && tier === 'high';
  mesh.receiveShadow = solid || g.category === 'trees-far';
  // Only trees on High show in the water; everything else is off the reflection's layer.
  if (!(tree && tier === 'high')) mesh.layers.set(NO_REFLECTION_LAYER);
  mesh.matrixAutoUpdate = false;
  mesh.computeBoundingSphere(); // frustum culling per cell
  return mesh;
}

interface Cell {
  mesh: THREE.InstancedMesh;
  kind: Kind;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Fog far plane assumed when the scene has none (day, about). */
const DEFAULT_FOG = 100;

/**
 * The area's vegetation: cell meshes shown or hidden every frame by their distance to the camera
 * (`visible`), so only a few cells are ever drawn, in every pass (shadows and reflection too).
 * The cull runs from `updateMatrixWorld`, which the renderer calls on the scene once a frame.
 */
export class Vegetation extends THREE.Group {
  private readonly cells: Cell[] = [];
  private readonly camera: THREE.Camera | null;
  private readonly tier: Tier;

  constructor(tier: Tier, camera: THREE.Camera | null) {
    super();
    this.tier = tier;
    this.camera = camera;
  }

  addCell(mesh: THREE.InstancedMesh, kind: Kind, plants: readonly Plant[]): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of plants) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const c = CROWN;
    this.cells.push({ mesh, kind, minX: minX - c, maxX: maxX + c, minZ: minZ - c, maxZ: maxZ + c });
    this.add(mesh);
  }

  /** The meshes now shown for a camera at (x, z) under fog ending at `fogFar`. */
  cull(x: number, z: number, fogFar: number): THREE.InstancedMesh[] {
    const shown: THREE.InstancedMesh[] = [];
    for (const c of this.cells) {
      const dx = Math.max(c.minX - x, 0, x - c.maxX);
      const dz = Math.max(c.minZ - z, 0, z - c.maxZ);
      c.mesh.visible = visible(c.kind, Math.hypot(dx, dz), this.tier, fogFar);
      if (c.mesh.visible) shown.push(c.mesh);
    }
    return shown;
  }

  override updateMatrixWorld(force?: boolean): void {
    if (this.camera) {
      const fog = this.parent instanceof THREE.Scene ? this.parent.fog : null;
      const far = fog instanceof THREE.Fog ? fog.far : DEFAULT_FOG;
      this.cull(this.camera.position.x, this.camera.position.z, far);
    }
    super.updateMatrixWorld(force);
  }
}

/**
 * Adds MegaKit trees, plants, grass and rocks to `parent` as instanced cell meshes (one per
 * model, primitive and 60 m of z). Placements are world-space (the meshes sit at the origin); `y` is
 * the ground height under each. Trees sway by their leaves, grass thins out with distance per
 * `tier`. With a `camera` the cells cull themselves every frame; returns the group (tests cull it).
 */
export async function addVegetation(
  parent: THREE.Object3D,
  plants: readonly Plant[],
  tier: Tier,
  camera: THREE.Camera | null = null,
): Promise<Vegetation> {
  const groups = groupItems(itemsFor(plants, tier));
  const all = await Promise.all(groups.map((g) => partsOf(g.category, g.model)));
  const vegetation = new Vegetation(tier, camera);
  groups.forEach((g, i) => {
    for (const part of all[i]) vegetation.addCell(instances(part, g, tier), g.kind, g.plants);
  });
  vegetation.matrixAutoUpdate = false;
  parent.add(vegetation);
  if (camera) vegetation.cull(camera.position.x, camera.position.z, DEFAULT_FOG);
  return vegetation;
}
