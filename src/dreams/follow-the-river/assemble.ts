import * as THREE from 'three/webgpu';
import { disposeScene } from '../../engine/dispose';
import { createBoxGrid } from '../../engine/grid';
import { loadModel } from '../../engine/models';
import { attachKeyShadows } from '../../engine/shadows';
import { VOLUME_LAYER } from '../../engine/volume';
import type { DreamContext } from '../types';
import { createAmbience } from './ambience';
import type { AreaDef } from './areas/types';
import { createAtmosphere } from './atmosphere';
import { groundAt, waterlineX } from './banks';
import { createBow, type Bow } from './bow';
import { DIFFICULTY, HORDE_CAPACITY } from './difficulty';
import { MOM_LANTERN } from './ending-scene';
import { createFish, type Fish } from './fish';
import { createFlashlight } from './flashlight';
import { createArmory, type Armory } from './gun';
import { createHud } from './hud';
import { propUrl } from './kits';
import { createPickupMeshes, type PickupMeshes } from './pickups';
import type { Systems } from './run';
import { createScares } from './scares';
import { loadSounds, type Sounds } from './sounds';
import { createGates } from './waves';
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
  armory: Armory;
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
    createBow(
      ctx.stage.camera,
      scene,
      ctx.audio,
      sounds,
      () => DIFFICULTY[ctx.difficulty()].keepHitArrows,
    ),
    createArmory(ctx.stage.camera, ctx.audio, sounds.shots),
    createFish(scene, ctx.audio, sounds, {
      ground: (x) => groundAt(area.bank, x),
      onBreach: (z) => world.railing?.break(z),
      waterline: waterlineX(area.bank),
    }),
    createPickupMeshes(scene),
    // The night's safe-spot building (the city's boathouse, the forest-edge camp…); Night 3 has none.
    area.safeProp ? loadModel(propUrl(area.safeProp.prop)) : Promise.resolve(new THREE.Group()),
  ]).then(([horde, bow, armory, fish, pickups, boathouse]) => ({
    horde,
    bow,
    armory,
    fish,
    pickups,
    boathouse,
  }));
}

/** Frees what a cancelled build made. Only touches the camera if the scene still owns it. */
function free(scene: THREE.Scene, camera: THREE.Camera, parts?: Partial<Systems>): void {
  // Scene first (as in the chapter teardown), while the viewmodels still hang off the camera.
  disposeScene(scene);
  parts?.horde?.dispose();
  parts?.bow?.dispose();
  parts?.armory?.dispose();
  parts?.fish?.dispose();
  parts?.pickups?.dispose();
  parts?.flashlight?.dispose();
  parts?.hud?.dispose();
  parts?.ambience?.dispose();
  parts?.scares?.dispose();
  if (camera.parent === scene) camera.removeFromParent();
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
  // The wave barricades: their colliders join the world's before any grid is built.
  const gates = await createGates(scene, area);
  world.colliders.push(...gates.boxes);
  const grid = createBoxGrid(world.colliders);
  const bodies = await loadBodies(ctx, area, world, grid, sounds);
  const { horde, bow, armory, fish, pickups, boathouse } = bodies;
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
  if (area.meetAt) lantern.position.set(area.meetAt.x + 0.5, MOM_LANTERN.height, area.meetAt.z);
  else lantern.position.set(safe?.x ?? 0, LANTERN_HEIGHT, safe ? safe.z + 2 : area.safeZ);
  scene.add(boathouse, lantern);
  lantern.layers.enable(VOLUME_LAYER); // Mom's lantern shows in the mist
  const atmosphere = createAtmosphere();
  scene.add(atmosphere.mesh);
  ctx.stage.mist(atmosphere.mesh.material);
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
    ctx.stage.mist(null);
    free(scene, camera, { ...bodies, flashlight, scares });
    return null;
  }
  // Two bodies on show, so both outfits compile (parked bodies are invisible, so skipped).
  horde.spawn(0, 0, 0, DAY_TUNING);
  horde.spawn(0, 0, 0, DAY_TUNING);
  attachKeyShadows(world.lights.key, ctx.stage.tier); // cascaded moon/sun shadows (none on Low)
  await ctx.stage.renderer.compileAsync(scene, camera);
  if (isCancelled()) {
    ctx.stage.mist(null);
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
    armory,
    fish,
    pickups,
    flashlight,
    hud,
    ambience,
    scares,
    gates,
    atmosphere,
  };
  return { sys, lantern };
}
