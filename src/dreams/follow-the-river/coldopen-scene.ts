import * as THREE from 'three/webgpu';
import { disposeScene } from '../../engine/dispose';
import { createBoxGrid } from '../../engine/grid';
import { loadModel } from '../../engine/models';
import type { DreamContext } from '../types';
import { CITY } from './areas/city';
import type { PropPlacement } from './areas/types';
import { TV_LIGHT } from './intro-scene';
import { KIT_SCALE, kitUrl } from './kits';
import { applyLighting, LIGHTING, type WorldLights } from './lighting';
import { loadSounds, type Sounds } from './sounds';
import { setWaterTier } from './water';
import { buildWorld } from './world';
import { createHorde, type Horde } from './zombies/horde';

// Tuning knobs (metres). Everything is in the CITY area's world coordinates.
/** Only the city north of this z is built: the shots never look further, and it halves the props. */
export const CUT_Z = -140;
/** Shamblers in the street-corner shot. */
export const HORDE_SIZE = 6;

/** The riverside house with the TV on: the intro's suburb house, upriver of the Day 1 start. */
export const HOUSE = { x: -15, z: 40, yaw: Math.PI / 2 } as const;
/**
 * The front window left of the door (seen from the river): the glass of building-type-a's opening
 * is a 1.6 x 0.8 m quad recessed ~0.3 m behind the facade (model units x -0.4, y 0.2, z 0.436, at
 * KIT_SCALE.suburb, yaw pi/2). The TV glow pane sits just in front of that glass, inside the wall.
 */
const GLASS = {
  x: -0.4 * KIT_SCALE.suburb,
  y: 0.2 * KIT_SCALE.suburb,
  depth: 0.44 * KIT_SCALE.suburb,
};
export const WINDOW = {
  x: HOUSE.x + GLASS.depth,
  y: GLASS.y,
  z: HOUSE.z - GLASS.x,
  width: 1.6,
  height: 0.8,
} as const;
const TV_GLOW_OFFSET = 1;

/** The street lamp the stagger plays under: a `light-square` of the Day 1 row (z = 10 − 18k). */
export const LAMP = { x: -8.5, z: -26 } as const;
/** light-square is 0.6 units tall with its head 0.21 units toward −z, at KIT_SCALE.roads. */
const LAMP_HEAD = { y: 0.6 * KIT_SCALE.roads - 0.2, dz: -0.21 * KIT_SCALE.roads } as const;
export const LAMP_LIGHT = { color: 0xffc27a, intensity: 30, distance: 16 } as const;

/** Lit windows on the backdrop buildings: dim and warm, fading into the fog like everything else. */
const WINDOW_GLOW = 0x6c5a32;
const TV_GLOW = 0x4a5c9a;
/** City buildings are ~0.95 units deep at KIT_SCALE.city; their fronts face the river (+x). */
const BUILDING_HALF_DEPTH = 0.47 * KIT_SCALE.city;
/** Window rows (height, m) and which buildings get one (every `every`th, offset so it looks random). */
const LIT_ROWS = [4.2, 7.6, 11] as const;
const LIT_EVERY = 3;
const LIT_SIZE = { width: 1.1, height: 1.4 } as const;

export interface ColdOpenScene {
  scene: THREE.Scene;
  lights: WorldLights;
  horde: Horde;
  sounds: Sounds;
  /** The street lamp (intensity 0 until the corner shot). */
  lamp: THREE.PointLight;
  /** The TV glow outside the window (intensity 0 until the window shot). */
  tvLight: THREE.PointLight;
  dispose(): void;
}

/** Pure: the backdrop buildings (kit 'city') and where a lit window would sit on each front. */
export function litWindows(props: readonly PropPlacement[]): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  const buildings = props.filter((p) => p.kit === 'city');
  buildings.forEach((b, i) => {
    if (i % LIT_EVERY !== 1) return;
    const y = LIT_ROWS[i % LIT_ROWS.length] ?? LIT_ROWS[0];
    out.push({ x: b.x + BUILDING_HALF_DEPTH + 0.1, y, z: b.z + (i % 2 ? 1.5 : -1.5) });
  });
  return out;
}

/** One quad facing +x (toward the river) per lit window, all sharing one material. */
function addLitWindows(scene: THREE.Scene, props: readonly PropPlacement[]): void {
  const geometry = new THREE.PlaneGeometry(LIT_SIZE.width, LIT_SIZE.height);
  const material = new THREE.MeshBasicMaterial({ color: WINDOW_GLOW });
  for (const w of litWindows(props)) {
    const quad = new THREE.Mesh(geometry, material);
    quad.position.set(w.x, w.y, w.z);
    quad.rotation.y = Math.PI / 2;
    scene.add(quad);
  }
}

function addHouse(scene: THREE.Scene, house: THREE.Object3D): THREE.PointLight {
  house.scale.setScalar(KIT_SCALE.suburb);
  house.position.set(HOUSE.x, 0, HOUSE.z);
  house.rotation.y = HOUSE.yaw;
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW.width, WINDOW.height),
    new THREE.MeshBasicMaterial({ color: TV_GLOW }),
  );
  pane.position.set(WINDOW.x, WINDOW.y, WINDOW.z);
  pane.rotation.y = Math.PI / 2;
  const tvLight = new THREE.PointLight(TV_LIGHT.color, 0, TV_LIGHT.distance, 2);
  tvLight.position.set(WINDOW.x + TV_GLOW_OFFSET, WINDOW.y, WINDOW.z);
  scene.add(house, pane, tvLight);
  return tvLight;
}

function addLamp(scene: THREE.Scene): THREE.PointLight {
  const lamp = new THREE.PointLight(LAMP_LIGHT.color, 0, LAMP_LIGHT.distance, 2);
  lamp.position.set(LAMP.x, LAMP_HEAD.y, LAMP.z + LAMP_HEAD.dz);
  scene.add(lamp);
  return lamp;
}

/**
 * The north half of the Day 1 city at dusk, with lit windows, a street lamp, the riverside house
 * and a small horde (parked). Both lights start dark so nothing recompiles when they come on.
 */
export async function buildColdOpenScene(ctx: DreamContext): Promise<ColdOpenScene> {
  const area = { ...CITY, props: CITY.props.filter((p) => p.z > CUT_Z), shacks: [] };
  setWaterTier(ctx.stage.tier);
  const [world, sounds, house] = await Promise.all([
    buildWorld(area, ctx.stage.tier, ctx.stage.camera),
    loadSounds(ctx.audio),
    loadModel(kitUrl('suburb', 'building-type-a')),
  ]);
  const { scene, lights } = world;
  applyLighting(lights, LIGHTING.dusk);
  addLitWindows(scene, area.props);
  const tvLight = addHouse(scene, house);
  const lamp = addLamp(scene);
  const grid = createBoxGrid(world.colliders);
  const horde = await createHorde(scene, ctx.audio, grid, sounds.groans, HORDE_SIZE);
  return {
    scene,
    lights,
    horde,
    sounds,
    lamp,
    tvLight,
    dispose() {
      disposeScene(scene);
      horde.dispose();
    },
  };
}
