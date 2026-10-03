import * as THREE from 'three/webgpu';
import { createBoxGrid } from '../../engine/grid';
import { loadModel } from '../../engine/models';
import type { DreamContext } from '../types';
import { createAmbience } from './ambience';
import type { AreaDef } from './areas/types';
import { createBow } from './bow';
import { createFish } from './fish';
import { createFlashlight } from './flashlight';
import { createHud } from './hud';
import { propUrl } from './kits';
import { createPickupMeshes } from './pickups';
import type { Systems } from './run';
import { loadSounds } from './sounds';
import { buildWorld } from './world';
import { DAY_TUNING } from './zombies/brain';
import { createHorde } from './zombies/horde';
import { SPAWNER } from './zombies/spawner';

const LANTERN_HEIGHT = 2.5;

export interface Assembled {
  sys: Systems;
  /** The boathouse lantern: always in the scene (intensity 0 by day), never added or removed. */
  lantern: THREE.PointLight;
}

/** Loads and wires everything the chapter needs, then compiles the shaders so nothing hitches in play. */
export async function assemble(ctx: DreamContext, area: AreaDef): Promise<Assembled> {
  const camera = ctx.stage.camera;
  const [world, sounds] = await Promise.all([buildWorld(area), loadSounds(ctx.audio)]);
  const grid = createBoxGrid(world.colliders);
  const scene = world.scene;
  const [horde, bow, fish, pickups, boathouse] = await Promise.all([
    createHorde(scene, ctx.audio, grid, sounds.groans, SPAWNER.cap),
    createBow(camera, scene, ctx.audio, sounds),
    createFish(scene, ctx.audio, sounds),
    createPickupMeshes(scene),
    loadModel(propUrl('boathouse')),
  ]);
  scene.add(camera);
  boathouse.position.set(0, 0, area.safeZ - 2);
  const lantern = new THREE.PointLight(0xffb060, 0, 30, 2);
  lantern.position.set(0, LANTERN_HEIGHT, area.safeZ);
  scene.add(boathouse, lantern);
  const flashlight = createFlashlight(camera);
  const hud = createHud(ctx.overlay.root);
  const ambience = createAmbience(ctx.audio, sounds);
  ctx.player.setColliders(world.colliders);
  // Two bodies on show, so both outfits compile (parked bodies are invisible, so skipped).
  horde.spawn(0, 0, 0, DAY_TUNING);
  horde.spawn(0, 0, 0, DAY_TUNING);
  await ctx.stage.renderer.compileAsync(scene, camera);
  const sys: Systems = {
    ctx,
    area,
    world,
    grid,
    sounds,
    horde,
    bow,
    fish,
    pickups,
    flashlight,
    hud,
    ambience,
  };
  return { sys, lantern };
}
