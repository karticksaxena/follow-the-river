import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import { addBatched } from '../../engine/batch';
import { disposeScene } from '../../engine/dispose';
import { loadModel, loadSkinned } from '../../engine/models';
import type { Tier } from '../../engine/quality';
import { attachKeyShadows } from '../../engine/shadows';
import { createMom, type Mom } from './intro-scene';
import { characterUrl, KIT_SCALE, kitUrl } from './kits';
import { applyLighting, createWorldLights, LIGHTING, SKY_NAME } from './lighting';
import { createWaterMesh, type WaterLook } from './water';

/** The river's meander in x as a function of z (the ride flows toward -z). Tuning knobs (metres). */
export const PATH = { amp: 9, wavelength: 150, amp2: 3, wavelength2: 55, phase2: 1.3 } as const;
/** Half the river's width, the bed depth, and the water's height. */
export const RIVER_HALF = 8;
export const BED_Y = -1.6;
export const WATER_LEVEL = 0;
/** Terrain cell size, half-width (x) and the margins past each end of the ride (z). */
export const TERRAIN = { cell: 2.5, halfWidth: 125, behind: 70, ahead: 120 } as const;

const TAU = Math.PI * 2;

/** Pure: the river's centre line x at `z`. */
export function pathX(z: number): number {
  return (
    PATH.amp * Math.sin((z * TAU) / PATH.wavelength) +
    PATH.amp2 * Math.sin((z * TAU) / PATH.wavelength2 + PATH.phase2)
  );
}

/** Pure: dx/dz of the centre line. */
export function pathSlope(z: number): number {
  return (
    ((PATH.amp * TAU) / PATH.wavelength) * Math.cos((z * TAU) / PATH.wavelength) +
    ((PATH.amp2 * TAU) / PATH.wavelength2) * Math.cos((z * TAU) / PATH.wavelength2 + PATH.phase2)
  );
}

const smooth = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** Pure: terrain height at `(x, z)` — a river bed, banks rising past the waterline, gentle hills. */
export function terrainY(x: number, z: number): number {
  const d = Math.abs(x - pathX(z));
  const bank = smooth((d - RIVER_HALF) / 5);
  const hills = (Math.sin(x * 0.07 + z * 0.05) + Math.sin(z * 0.11 - x * 0.04)) * 0.35 * bank;
  const rise = Math.min(3.5, Math.max(0, d - 14) * 0.06);
  return BED_Y + 2.2 * bank + hills + rise;
}

/** Pure, deterministic 0..1 noise for placement (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WATER_LOOK: WaterLook = { speed: 1.6, deep: 0x2b5750, streak: 0x9cc2b0, glow: 0x1d4a3c };

/** Foliage and ground colours (sRGB hex). Tuning knobs. */
const COLORS = {
  leaves: [0x74ae3e, 0x58943a, 0x3f7d33],
  bark: 0x5b4331,
  grass: [0x86bf4c, 0x62a63c],
  canoe: 0x8a5a36,
  mud: 0x7a6a45,
  rock: 0x77756c,
  meadow: [0x5f9a36, 0x4a8630],
  flowers: [0xf2d24a, 0xf4f0e0, 0xe58fb4],
} as const;

export interface CanoeScene {
  scene: THREE.Scene;
  canoe: THREE.Group;
  mom: Mom;
  paddle: THREE.Group;
  calf: Calf;
  sky: THREE.Object3D;
  dispose(): void;
}

/** One cloned tinted material per (source, colour): a thousand trees share a handful. */
function tinter(): (root: THREE.Object3D, pick: (name: string) => number | null) => void {
  const cache = new Map<string, THREE.Material>();
  return (root, pick) => {
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const source: unknown = node.material; // lit standard material after loadModel
      if (!(source instanceof THREE.MeshStandardMaterial)) return;
      const hex = pick(source.name);
      if (hex === null) return;
      const key = `${source.uuid}|${hex}`;
      let tinted = cache.get(key);
      if (!tinted) {
        tinted = source.clone();
        delete tinted.userData.cached;
        if ('color' in tinted && tinted.color instanceof THREE.Color) tinted.color.setHex(hex);
        cache.set(key, tinted);
      }
      node.material = tinted;
    });
  };
}

const isLeaf = (n: string): boolean => /leaf/i.test(n);
const isWood = (n: string): boolean => /wood|bark/i.test(n);
const isGrass = (n: string): boolean => /grass/i.test(n);

/** Pure: the terrain mesh's own height at (x, z): the flat triangle of the grid cell, exactly as drawn. */
export function meshY(x: number, z: number, zNear: number = TERRAIN.behind): number {
  const { cell, halfWidth } = TERRAIN;
  const k = Math.floor((x + halfWidth) / cell);
  const r = Math.floor((zNear - z) / cell);
  const x0 = -halfWidth + k * cell;
  const z0 = zNear - r * cell;
  const u = (x - x0) / cell;
  const v = (z0 - z) / cell;
  const h00 = terrainY(x0, z0);
  const h10 = terrainY(x0 + cell, z0);
  const h01 = terrainY(x0, z0 - cell);
  const h11 = terrainY(x0 + cell, z0 - cell);
  // makeTerrain's index order: (i, i+cols, i+1) and (i+1, i+cols, i+cols+1).
  return u + v <= 1
    ? h00 + (h10 - h00) * u + (h01 - h00) * v
    : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

function makeTerrain(zNear: number, zFar: number): THREE.Mesh {
  const { cell, halfWidth } = TERRAIN;
  const cols = Math.round((2 * halfWidth) / cell) + 1;
  const rows = Math.round((zNear - zFar) / cell) + 1;
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  const noise = rng(7);
  const c = new THREE.Color();
  const a = new THREE.Color();
  const b = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = r * cols + k;
      const x = -halfWidth + k * cell;
      const z = zNear - r * cell;
      const y = terrainY(x, z);
      pos.set([x, y, z], i * 3);
      a.setHex(COLORS.meadow[0]);
      b.setHex(COLORS.meadow[1]);
      c.lerpColors(a, b, noise());
      if (y < 0.25) c.lerp(a.setHex(COLORS.mud), 1 - smooth((y + 0.2) / 0.5) * 0.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
  }
  const index = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let n = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < cols - 1; k++) {
      const i = r * cols + k;
      index.set([i, i + cols, i + 1, i + 1, i + cols, i + cols + 1], n);
      n += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  return terrain;
}

interface Scatter {
  model: THREE.Object3D;
  count: number;
  /** Distance from the river centre line: min and max (metres). */
  from: number;
  to: number;
  scale: readonly [number, number];
  minY: number;
}

const SINK = 0.15; // trunks and rocks bite into the ground

/** Clones `model` at random bank spots (deterministic). */
function scatter(
  s: Scatter,
  zNear: number,
  zFar: number,
  rand: () => number,
  recolor: (root: THREE.Object3D) => void,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (let i = 0; i < s.count; i++) {
    const z = zNear - rand() * (zNear - zFar);
    const d = s.from + (s.to - s.from) * rand() ** 1.4;
    const x = pathX(z) + (rand() < 0.5 ? -d : d);
    if (terrainY(x, z) < s.minY) continue;
    const item = s.model.clone(true);
    recolor(item);
    item.position.set(x, meshY(x, z) - SINK, z);
    item.rotation.y = rand() * TAU;
    item.scale.setScalar(s.scale[0] + (s.scale[1] - s.scale[0]) * rand());
    out.push(item);
  }
  return out;
}

const TREES = [
  'tree_oak_dark',
  'tree_default_dark',
  'tree_detailed_dark',
  'tree_tall_dark',
  'tree_pineTallA',
  'tree_pineTallB',
  'tree_pineTallC',
  'tree_pineDefaultA',
] as const;

async function addForest(scene: THREE.Scene, zNear: number, zFar: number): Promise<void> {
  const tint = tinter();
  const rand = rng(11);
  const [trees, bush, bushL, grass, rocks] = await Promise.all([
    Promise.all(TREES.map((t) => loadModel(kitUrl('nature', t)))),
    loadModel(kitUrl('nature', 'plant_bush')),
    loadModel(kitUrl('nature', 'plant_bushLarge')),
    loadModel(kitUrl('nature', 'grass_large')),
    Promise.all(
      ['rock_largeA', 'rock_largeC', 'rock_tallB'].map((r) => loadModel(kitUrl('nature', r))),
    ),
  ]);
  const leafy = (root: THREE.Object3D): void => {
    const leaf = COLORS.leaves[Math.floor(rand() * COLORS.leaves.length)] ?? COLORS.leaves[0];
    tint(root, (n) => (isLeaf(n) ? leaf : isWood(n) ? COLORS.bark : null));
  };
  const green = (root: THREE.Object3D): void => {
    const g = COLORS.grass[Math.floor(rand() * COLORS.grass.length)] ?? COLORS.grass[0];
    tint(root, (n) => (isGrass(n) ? g : null));
  };
  const S = KIT_SCALE.nature;
  const roots: THREE.Object3D[] = [];
  for (const model of trees) {
    roots.push(
      ...scatter(
        { model, count: 110, from: RIVER_HALF + 1.5, to: 95, scale: [S * 0.9, S * 1.6], minY: 0.2 },
        zNear,
        zFar,
        rand,
        leafy,
      ),
    );
  }
  const spec = { from: RIVER_HALF + 1, to: 40, minY: 0.1 };
  roots.push(
    ...scatter(
      { ...spec, model: bush, count: 220, scale: [S * 0.8, S * 1.4] },
      zNear,
      zFar,
      rand,
      green,
    ),
    ...scatter(
      { ...spec, model: bushL, count: 140, scale: [S * 0.8, S * 1.3] },
      zNear,
      zFar,
      rand,
      green,
    ),
    ...scatter(
      { ...spec, model: grass, count: 600, scale: [S * 0.4, S * 0.7] },
      zNear,
      zFar,
      rand,
      green,
    ),
  );
  for (const rock of rocks) {
    roots.push(
      ...scatter(
        {
          model: rock,
          count: 12,
          from: RIVER_HALF - 1,
          to: 30,
          scale: [S * 0.5, S * 1.1],
          minY: -0.4,
        },
        zNear,
        zFar,
        rand,
        (root) => tint(root, () => COLORS.rock),
      ),
    );
  }
  addBatched(scene, roots);
}

/** Meadow flowers: one instanced mesh of tiny coloured blobs scattered on the banks. */
function makeFlowers(zNear: number, zFar: number): THREE.InstancedMesh {
  const count = 600;
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.11, 0),
    new THREE.MeshLambertMaterial(),
    count,
  );
  const rand = rng(23);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const z = zNear - rand() * (zNear - zFar);
    const x = pathX(z) + (rand() < 0.5 ? -1 : 1) * (RIVER_HALF + 2 + rand() ** 1.5 * 30);
    dummy.position.set(x, meshY(x, z) + 0.13, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(COLORS.flowers[i % COLORS.flowers.length] ?? 0xffffff));
  }
  mesh.frustumCulled = false;
  return mesh;
}

/** A double-bladed paddle of dark wood lying along x, pivoting about its middle. */
function makePaddle(): THREE.Group {
  const wood = new THREE.MeshLambertMaterial({ color: 0x3a2618 });
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 6), wood);
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);
  for (const side of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.2), wood);
    blade.position.x = side * 1.2;
    group.add(blade);
  }
  return group;
}

async function makeCanoe(): Promise<THREE.Group> {
  const group = new THREE.Group();
  const model = await loadModel(kitUrl('nature', 'canoe'));
  model.scale.setScalar(CANOE_SCALE);
  tinter()(model, (n) => (isLeaf(n) ? COLORS.leaves[0] : isWood(n) ? COLORS.canoe : null));
  group.add(model);
  return group;
}

export interface Calf {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  dispose(): void;
}

/** The orca calf: tiny, hidden until the ride surfaces it; Swim loops from the start. */
export const CALF_SCALE = 0.35;
function makeCalf(asset: { scene: THREE.Object3D; clips: readonly THREE.AnimationClip[] }): Calf {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.visible = false;
  const body = clone(asset.scene);
  body.traverse((n) => (n.frustumCulled = false));
  body.scale.setScalar(CALF_SCALE);
  root.add(body);
  const mixer = new THREE.AnimationMixer(body);
  const swim = asset.clips.find((c) => c.name === 'Swim');
  if (swim) mixer.clipAction(swim).play();
  return {
    root,
    mixer,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(body);
    },
  };
}

/** Native canoe is 1.15 m long; this scales it to about 4 m. */
export const CANOE_SCALE = KIT_SCALE.nature * 0.7;

/** What the scene needs of the stage: its camera's shadow cascades and the graphics tier. */
export interface CanoeStage {
  tier: Tier;
}

/** Builds the whole sunrise forest river; `length` is how far down the river (metres) the ride goes. */
export async function buildCanoeScene(length: number, stage: CanoeStage): Promise<CanoeScene> {
  const zNear = TERRAIN.behind;
  const zFar = -length - TERRAIN.ahead;
  const scene = new THREE.Scene();
  const lights = createWorldLights(scene);
  attachKeyShadows(lights.key, stage.tier); // the sun's shadows: the forest, the canoe, Mom
  applyLighting(lights, LIGHTING.sunrise);
  const terrain = makeTerrain(zNear, zFar);
  const water = createWaterMesh(TERRAIN.halfWidth * 2.4, zNear - zFar, WATER_LOOK);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_LEVEL, (zNear + zFar) / 2);
  scene.add(terrain, water, makeFlowers(zNear, zFar));
  const [canoe, momAsset, orca] = await Promise.all([
    makeCanoe(),
    loadSkinned(characterUrl('mom')),
    loadSkinned(characterUrl('orca')),
    addForest(scene, zNear, zFar),
  ]);
  const mom = createMom(momAsset, new THREE.Group());
  mom.rest = 'Row';
  mom.play('Row'); // paddling (tools/blender/mom_clips.py); the ride switches her to Sit at the end
  const paddle = makePaddle();
  canoe.add(mom.group, paddle);
  const calf = makeCalf(orca);
  scene.add(canoe, calf.root);
  const sky = scene.getObjectByName(SKY_NAME) ?? new THREE.Object3D();
  return {
    scene,
    canoe,
    mom,
    paddle,
    calf,
    sky,
    dispose() {
      mom.dispose();
      calf.dispose();
      disposeScene(scene);
    },
  };
}
