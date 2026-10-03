import * as THREE from 'three/webgpu';
import { addBatched } from '../../engine/batch';
import { boxAt, type Box } from '../../engine/collide';
import { loadModel } from '../../engine/models';
import type { AreaDef, PropPlacement } from './areas/types';
import { KIT_SCALE, kitUrl } from './kits';
import { createWorldLights, type WorldLights } from './lighting';
import { addRiver, EDGE_X, OVERRUN, plane, RIVER_WIDTH } from './river';
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
  model.position.set(p.x, 0, p.z);
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
function stripBlockers(area: AreaDef): Box[] {
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

function addGround(scene: THREE.Scene, area: AreaDef): void {
  const ground = plane(120, area.startZ - area.endZ + 2 * OVERRUN, area.ground);
  ground.position.set(EDGE_X - 60, 0, (area.startZ + area.endZ) / 2);
  scene.add(ground);
}

/** Builds an area: lights, ground, river, skyline, props, shacks and every blocker. */
export async function buildWorld(area: AreaDef): Promise<World> {
  const scene = new THREE.Scene();
  const lights = createWorldLights(scene);
  addGround(scene, area);
  addRiver(scene, area.startZ, area.endZ, area.farBank);
  const colliders = stripBlockers(area);
  const [props] = await Promise.all([
    Promise.all(area.props.map(loadProp)),
    addSkyline(scene, area.skyline, area.startZ, area.endZ),
    ...area.shacks.map((shack) => addShack(scene, shack)),
  ]);
  for (const { collider } of props) if (collider) colliders.push(collider);
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
