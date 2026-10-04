import * as THREE from 'three/webgpu';
import { addBatched } from '../../engine/batch';
import { boxAt, type Box } from '../../engine/collide';
import { loadModel } from '../../engine/models';
import type { AreaDef, PropPlacement } from './areas/types';
import { addBanks, groundEndX } from './banks';
import { addCampfire } from './campfire';
import { KIT_SCALE, kitUrl } from './kits';
import { createWorldLights, type WorldLights } from './lighting';
import { addLake, addRiver, EDGE_X, LAKE, OVERRUN, plane, RIVER_WIDTH } from './river';
import { addShack, shackBounds, shackColliders } from './shack';
import { addSkyline } from './skyline';

export interface World {
  scene: THREE.Scene;
  colliders: Box[];
  lights: WorldLights;
  insideShack(x: number, z: number): boolean;
}

/** Colliders are the prop's footprint shrunk a little so players don't snag on corners. */
const COLLIDER_SHRINK = 0.95;
const BARRICADE_DEPTH = 0.6;

const box3 = new THREE.Box3();
const size = new THREE.Vector3();
const centre = new THREE.Vector3();

async function loadProp(p: PropPlacement): Promise<{ model: THREE.Object3D; collider?: Box }> {
  const model = await loadModel(kitUrl(p.kit, p.model));
  model.position.set(p.x, p.y ?? 0, p.z);
  model.rotation.y = p.yaw ?? 0;
  model.scale.setScalar(KIT_SCALE[p.kit] * (p.scale ?? 1));
  if (!p.collide) return { model };
  box3.setFromObject(model);
  box3.getSize(size);
  box3.getCenter(centre);
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

function addGround(scene: THREE.Scene, area: AreaDef): void {
  const { z0, z1 } = groundSpan(area);
  const ground = plane(120, z0 - z1, area.ground);
  ground.position.set(groundEndX(area.bank) - 60, 0, (z0 + z1) / 2);
  scene.add(ground);
}

/** The river (stopping at a lake's shore, where the lake begins) and its skyline. */
function addWaters(scene: THREE.Scene, area: AreaDef): Promise<void> {
  const { lake } = area;
  const embankment = area.bank === 'embankment';
  const grass = [area.ground, area.farBank] as const;
  if (!lake) {
    addRiver(scene, area.startZ, area.endZ, { farBankColor: area.farBank, embankment });
    addBanks(scene, area.bank, [area.startZ, area.endZ], grass);
    return addSkyline(scene, area.skyline, area.startZ, area.endZ);
  }
  addRiver(scene, area.startZ, lake.z, { farBankColor: area.farBank, endOverrun: 0, embankment });
  addBanks(scene, area.bank, [area.startZ, lake.z], grass, 0);
  addLake(scene, lake.z, area.ground, area.farBank);
  return addSkyline(scene, area.skyline, area.startZ, lake.z, 0);
}

/** Builds an area: lights, ground, river, skyline, props, shacks and every blocker. */
export async function buildWorld(area: AreaDef): Promise<World> {
  const scene = new THREE.Scene();
  const lights = createWorldLights(scene);
  addGround(scene, area);
  const colliders = stripBlockers(area);
  const [props, fire] = await Promise.all([
    Promise.all(area.props.map(loadProp)),
    addCampfire(scene, area.waitSpot.x, area.waitSpot.z),
    addWaters(scene, area),
    ...area.shacks.map((shack) => addShack(scene, shack)),
  ]);
  for (const { collider } of props) if (collider) colliders.push(collider);
  colliders.push(fire);
  addBatched(
    scene,
    props.map((p) => p.model),
  );
  for (const shack of area.shacks) colliders.push(...shackColliders(shack));
  const bounds = area.shacks.map(shackBounds);
  return {
    scene,
    colliders,
    lights,
    insideShack(x, z) {
      for (const b of bounds) {
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
      }
      return false;
    },
  };
}
