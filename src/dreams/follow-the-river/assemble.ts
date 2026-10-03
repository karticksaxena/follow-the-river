import * as THREE from 'three/webgpu';
import { disposeScene } from '../../engine/dispose';
import { createBoxGrid } from '../../engine/grid';
import { loadModel } from '../../engine/models';
import type { DreamContext } from '../types';
import { createAmbience } from './ambience';
import type { AreaDef } from './areas/types';
import { createBow, type Bow } from './bow';
import { HORDE_CAPACITY } from './difficulty';
import { createFish, type Fish } from './fish';
import { createFlashlight } from './flashlight';
import { createGun, type Gun } from './gun';
import { createHud } from './hud';
import { propUrl } from './kits';
import { createPickupMeshes, type PickupMeshes } from './pickups';
import type { Systems } from './run';
import { createScares } from './scares';
import { loadSounds, type Sounds } from './sounds';
import { buildWorld, type World } from './world';
import { DAY_TUNING } from './zombies/brain';
import { createHorde, type Horde } from './zombies/horde';

const LANTERN_HEIGHT = 2.5;

export interface Assembled {
  sys: Systems;
  /** The boathouse lantern: always in the scene (intensity 0 by day), never added or removed. */
  lantern: THREE.PointLight;
}

interface Bodies {
  horde: Horde;
  bow: Bow;
  gun: Gun;
  fish: Fish;
  pickups: PickupMeshes;
  boathouse: THREE.Object3D;
}

function loadBodies(
  ctx: DreamContext,
  area: AreaDef,
  world: World,
  grid: ReturnType<typeof createBoxGrid>,
  sounds: Sounds,
): Promise<Bodies> {
  const { scene } = world;
  return Promise.all([
    createHorde(scene, ctx.audio, grid, sounds.groans, HORDE_CAPACITY),
    createBow(ctx.stage.camera, scene, ctx.audio, sounds),
    createGun(ctx.stage.camera, scene, ctx.audio, sounds),
    createFish(scene, ctx.audio, sounds),
    createPickupMeshes(scene),
    // The night's safe-spot building (the city's boathouse, the forest-edge camp…); Night 3 has none.
    area.safeProp ? loadModel(propUrl(area.safeProp.prop)) : Promise.resolve(new THREE.Group()),
  ]).then(([horde, bow, gun, fish, pickups, boathouse]) => ({
    horde,
    bow,
    gun,
    fish,
    pickups,
    boathouse,
  }));
}

/** Frees what a cancelled build made. Only touches the camera if the scene still owns it. */
function free(scene: THREE.Scene, camera: THREE.Camera, parts?: Partial<Systems>): void {
  parts?.horde?.dispose();
  parts?.bow?.dispose();
  parts?.gun?.dispose();
  parts?.fish?.dispose();
  parts?.pickups?.dispose();
  parts?.flashlight?.dispose();
  parts?.hud?.dispose();
  parts?.ambience?.dispose();
  parts?.scares?.dispose();
  if (camera.parent === scene) camera.removeFromParent();
  disposeScene(scene);
}

/**
 * Loads and wires everything the chapter needs, then compiles the shaders so nothing hitches in
 * play. `isCancelled` is checked after every await; when it fires, everything built is freed and
 * null is returned (the stage, player and overlay are never touched).
 */
export async function assemble(
  ctx: DreamContext,
  area: AreaDef,
  isCancelled: () => boolean,
): Promise<Assembled | null> {
  const camera = ctx.stage.camera;
  const [world, sounds] = await Promise.all([buildWorld(area), loadSounds(ctx.audio)]);
  const scene = world.scene;
  if (isCancelled()) {
    disposeScene(scene);
    return null;
  }
  const grid = createBoxGrid(world.colliders);
  const bodies = await loadBodies(ctx, area, world, grid, sounds);
  const { horde, bow, gun, fish, pickups, boathouse } = bodies;
  if (isCancelled()) {
    free(scene, camera, bodies);
    return null;
  }
  scene.add(camera);
  const safe = area.safeProp;
  if (safe) {
    boathouse.position.set(safe.x, 0, safe.z);
    boathouse.rotation.y = safe.yaw;
  }
  const lantern = new THREE.PointLight(0xffb060, 0, 30, 2);
  lantern.position.set(safe?.x ?? 0, LANTERN_HEIGHT, safe ? safe.z + 2 : area.safeZ);
  scene.add(boathouse, lantern);
  const flashlight = createFlashlight(camera);
  const scares = await createScares(
    ctx,
    scene,
    area.scares,
    horde,
    sounds,
    flashlight,
    area.shacks,
  );
  if (isCancelled()) {
    free(scene, camera, { ...bodies, flashlight, scares });
    return null;
  }
  // Two bodies on show, so both outfits compile (parked bodies are invisible, so skipped).
  horde.spawn(0, 0, 0, DAY_TUNING);
  horde.spawn(0, 0, 0, DAY_TUNING);
  await ctx.stage.renderer.compileAsync(scene, camera);
  if (isCancelled()) {
    free(scene, camera, { ...bodies, flashlight, scares });
    return null;
  }
  const hud = createHud(ctx.overlay.root);
  const ambience = createAmbience(ctx.audio, sounds);
  ctx.player.setColliders(world.colliders);
  const sys: Systems = {
    ctx,
    area,
    world,
    grid,
    sounds,
    horde,
    bow,
    gun,
    fish,
    pickups,
    flashlight,
    hud,
    ambience,
    scares,
  };
  return { sys, lantern };
}
