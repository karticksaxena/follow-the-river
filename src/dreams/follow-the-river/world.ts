import * as THREE from 'three/webgpu';
import { addBatched } from '../../engine/batch';
import { boxAt, type Box } from '../../engine/collide';
import { setInteriors } from '../../engine/interiors';
import { loadModel } from '../../engine/models';
import type { Tier } from '../../engine/quality';
import { surfaceMaterial, texturesReady } from '../../engine/surfaces';
import { NO_REFLECTION_LAYER } from '../../engine/volume';
import type { AreaDef, PropPlacement } from './areas/types';
import { addBanks, groundEndX } from './banks';
import { addCampfire } from './campfire';
import { groundSurfaces } from './ground';
import { KIT_SCALE, kitUrl } from './kits';
import { addLake } from './lake';
import { createWorldLights, type WorldLights } from './lighting';
import { addVegetation, type Vegetation } from './nature';
import type { Railing } from './railing';
import { addRiver, bentPlane, EDGE_X, LAKE, OVERRUN, RIVER_WIDTH } from './river';
import { addShack, shackBounds, shackColliders, shackInterior } from './shack';
import { bendFor, type Bend } from './shore-shape';
import { addSkyline, setSkylineTier } from './skyline';
import { plantsOf, stripGrass } from './vegetation';

export interface World {
  scene: THREE.Scene;
  colliders: Box[];
  /** The city's near railing (the orca breaks it); null on natural banks. */
  railing: Railing | null;
  lights: WorldLights;
  insideShack(x: number, z: number): boolean;
  /** The live tier changed: vegetation reach, shadows and reflections follow (no-op if unchanged). */
  setTier(tier: Tier): void;
  /** Warm-up: every plant cell on show (or `sample`: one cell per material), wherever the camera is; returns the undo. */
  showAllPlants(sample?: boolean): () => void;
}

/** Colliders are the prop's footprint shrunk a little so players don't snag on corners. */
const COLLIDER_SHRINK = 0.95;
const BARRICADE_DEPTH = 0.6;

const box3 = new THREE.Box3();
const size = new THREE.Vector3();
const centre = new THREE.Vector3();

/** Kenney road tiles: asphalt on the road, concrete on the kerbs, the painted lines keep their colour. */
function paveRoad(model: THREE.Object3D, memo: Map<THREE.Texture, THREE.Material>): void {
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial)) {
      return;
    }
    const walkway = node.material.map;
    if (!walkway) return;
    let paved = memo.get(walkway);
    if (!paved) {
      paved = surfaceMaterial({ base: 'asphalt', blend: 'pavement', walkway, puddles: true });
      memo.set(walkway, paved);
    }
    node.material = paved;
  });
}

/** A prop whose longest side is under this (m) is small: logs, pebbles, boxes. Tuning knob. */
export const SMALL_PROP = 1.6;

/** Small props stay out of the water's reflection, and cast no key-light shadows on Medium and Low. */
export function smallProp(model: THREE.Object3D, tier: Tier): void {
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.layers.set(NO_REFLECTION_LAYER);
    if (tier !== 'high') node.castShadow = false;
  });
}

async function loadProp(
  p: PropPlacement,
  paved: Map<THREE.Texture, THREE.Material>,
  tier: Tier,
): Promise<{ model: THREE.Object3D; collider?: Box }> {
  const model = await loadModel(kitUrl(p.kit, p.model));
  if (p.kit === 'roads' && p.model.startsWith('road-')) paveRoad(model, paved);
  model.position.set(p.x, p.y ?? 0, p.z);
  model.rotation.y = p.yaw ?? 0;
  model.scale.setScalar(KIT_SCALE[p.kit] * (p.scale ?? 1));
  box3.setFromObject(model);
  box3.getSize(size);
  box3.getCenter(centre);
  if (Math.max(size.x, size.y, size.z) < SMALL_PROP) smallProp(model, tier);
  if (!p.collide) return { model };
  return {
    model,
    collider: boxAt(centre.x, centre.z, size.x * COLLIDER_SHRINK, size.z * COLLIDER_SHRINK),
  };
}

/** The river, the land-side wall, both ends and the barricade line: the edges of the walkable strip. */
export function stripBlockers(area: AreaDef): Box[] {
  const { landX, startZ, endZ } = area;
  const middle = (startZ + endZ) / 2;
  const length = startZ - endZ + 4;
  const bankWidth = EDGE_X - landX;
  const wide = bankWidth + RIVER_WIDTH + 4;
  const wideX = landX - 2 + wide / 2;
  return [
    boxAt(EDGE_X + RIVER_WIDTH / 2, middle, RIVER_WIDTH, length),
    boxAt(landX - 1, middle, 2, length),
    boxAt(wideX, startZ + 1, wide, 2),
    boxAt(wideX, endZ - 1, wide, 2),
    boxAt((landX + EDGE_X) / 2, area.barricadeZ, bankWidth, BARRICADE_DEPTH),
  ];
}

/** Pure: the z range (near, far) of the land west of the river; it stops at a lake's shore. */
export function groundSpan(area: AreaDef): { z0: number; z1: number } {
  return {
    z0: area.startZ + OVERRUN,
    z1: area.lake ? area.lake.z + LAKE.pebbleDepth : area.endZ - OVERRUN,
  };
}

/** The river bends away past both walkable ends, but not at a lake, where the lake takes over. */
export function bendOf(area: AreaDef): Bend {
  return bendFor(area.startZ, area.endZ, !area.lake);
}

function addGround(scene: THREE.Scene, area: AreaDef): void {
  const { z0, z1 } = groundSpan(area);
  const at = [groundEndX(area.bank) - 60, 0, (z0 + z1) / 2] as const;
  scene.add(bentPlane([120, z0 - z1], area.ground, groundSurfaces(area).ground, at, bendOf(area)));
}

interface Waters {
  railing: Railing | null;
  skyline: THREE.Object3D[];
}

/** The river (stopping at a lake's shore, where the lake begins) and its skyline. */
async function addWaters(scene: THREE.Scene, area: AreaDef, tier: Tier): Promise<Waters> {
  const { lake } = area;
  const embankment = area.bank === 'embankment';
  const grass = [area.ground, area.farBank] as const;
  const bend = bendOf(area);
  const farBankColor = area.farBank;
  const { far, ground } = groundSurfaces(area);
  if (!lake) {
    addRiver(scene, area.startZ, area.endZ, { farBankColor, farSurface: far, embankment, bend });
    const span = [area.startZ, area.endZ] as const;
    const railing = addBanks(scene, area.bank, span, grass, OVERRUN, bend, undefined, ground);
    const skyline = await addSkyline(
      scene,
      area.skyline,
      area.startZ,
      area.endZ,
      undefined,
      bend,
      tier,
    );
    return { railing, skyline };
  }
  addRiver(scene, area.startZ, lake.z, {
    farBankColor,
    farSurface: far,
    endOverrun: 0,
    embankment,
    bend,
  });
  const railing = addBanks(scene, area.bank, [area.startZ, lake.z], grass, 0, bend, lake.z, ground);
  addLake(scene, lake.z, area.ground, area.farBank, ground);
  const skyline = await addSkyline(scene, area.skyline, area.startZ, lake.z, 0, bend, tier);
  return { railing, skyline };
}

/** MegaKit trees, ferns, rocks and the tier's grass, instanced (`nature.ts`). */
async function addPlants(
  scene: THREE.Scene,
  area: AreaDef,
  tier: Tier,
  camera: THREE.Camera | null,
): Promise<Vegetation> {
  const grass = stripGrass(area, tier, area.shacks.map(shackBounds));
  return addVegetation(scene, [...plantsOf(area), ...grass], tier, camera);
}

/** Builds an area: lights, ground, river, skyline, props, plants, shacks and every blocker. */
export async function buildWorld(
  area: AreaDef,
  tier: Tier = 'high',
  camera: THREE.Camera | null = null,
): Promise<World> {
  const scene = new THREE.Scene();
  const lights = createWorldLights(scene);
  addGround(scene, area);
  const colliders = stripBlockers(area);
  const paved = new Map<THREE.Texture, THREE.Material>();
  const [props, fire, waters, vegetation] = await Promise.all([
    Promise.all(area.props.filter((p) => p.kit !== 'megakit').map((p) => loadProp(p, paved, tier))),
    addCampfire(scene, area.waitSpot.x, area.waitSpot.z),
    addWaters(scene, area, tier),
    addPlants(scene, area, tier, camera),
    ...area.shacks.map((shack) => addShack(scene, shack)),
  ]);
  await texturesReady(); // the ground never pops in
  for (const { collider } of props) if (collider) colliders.push(collider);
  colliders.push(fire);
  addBatched(
    scene,
    props.map((p) => p.model),
  );
  for (const shack of area.shacks) colliders.push(...shackColliders(shack));
  setInteriors(area.shacks.map(shackInterior)); // the lights leave their insides dark
  let live = tier;
  const bounds = area.shacks.map(shackBounds);
  const { railing, skyline } = waters;
  return {
    scene,
    colliders,
    railing,
    lights,
    setTier(next) {
      if (next === live) return;
      live = next;
      vegetation.setTier(next);
      setSkylineTier(skyline, next);
    },
    showAllPlants: (sample) => vegetation.showAll(sample),
    insideShack(x, z) {
      for (const b of bounds) {
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
      }
      return false;
    },
  };
}
