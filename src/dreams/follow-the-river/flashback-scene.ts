import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import { disposeScene } from '../../engine/dispose';
import { loadModel, loadSkinned, type SkinnedAsset } from '../../engine/models';
import type { DreamContext } from '../types';
import { findClip, smooth } from './fish-parts';
import { createCharacter, type Character } from './intro-scene';
import { characterUrl, propUrl } from './kits';
import { makeMic, makeMonitor } from './lab-props';
import { applyLighting, createWorldLights, LIGHTING } from './lighting';
import { createWaterMesh, RIVER_FLOW } from './water';

export type Tape = 1 | 2 | 3;
type Vec = readonly [number, number, number];

/** One slow camera move: `from` → `to` over `seconds` (eased), always looking at `look`. */
export interface Shot {
  from: Vec;
  to: Vec;
  look: Vec;
  seconds: number;
}

/** Tuning knobs. Metres; the lab/tank GLBs have their origin at the floor's centre. */
export const SHOTS: Readonly<Record<Tape, Shot>> = {
  // Tank (tape 1): three-quarter view past Mom's shoulder into the glass; a slow push-in.
  1: { from: [3.4, 1.7, 4.6], to: [2.6, 1.55, 3.6], look: [-0.3, 1.3, -0.2], seconds: 40 },
  // Lab (tape 2): Mom's back at the bench, her screen glowing in front of her, the cage and the red lamp beside it.
  2: { from: [3.4, 1.75, 1.2], to: [2.8, 1.65, 0.7], look: [0.9, 1.2, -2.5], seconds: 40 },
  // Spillway: behind Mom on the bank, looking out over the river.
  3: { from: [4.5, 1.9, 1.5], to: [4.0, 1.8, 1.0], look: [-6, 0.4, -4], seconds: 45 },
};

/** Never bright: dim cold ambience, one warm or red practical per shot. */
export const LAB_LIGHT = {
  ambient: { sky: 0x364652, ground: 0x08080a, intensity: 4 },
  fog: { color: 0x1a222c, near: 3, far: 22 },
  monitors: { color: 0x4a6a96, intensity: 5, distance: 5, at: [0.9, 1.4, -2.2] as Vec },
  /** A soft cold work light from the camera's side, so the room and Mom read (Kartik: every tape was "dark as hell"). */
  fill: { color: 0xa6b8c9, intensity: 13, distance: 11, at: [2.4, 2.8, 2.2] as Vec },
  lamp: { color: 0xff2010, distance: 7, at: [2.6, 2.4, -2.7] as Vec },
  /** Red lamp pulse: emissive intensity swings between `min` and `max` every `period` seconds. */
  pulse: { min: 0.15, max: 1.3, period: 2.4 },
  screenGlow: 0.5,
} as const;

/** Mom records at the bench facing the lab GLB's right-hand monitor (x 0.6..1.2 on the wall at z -2.55); yaw π faces −Z (Kartik: "she's talking to the wall"). */
export const LAB_MOM = { x: 0.9, z: -1.75, yaw: Math.PI, screenX: 0.9, screenZ: -2.55 } as const;

export const TANK_LIGHT = {
  ambient: { sky: 0x31414e, ground: 0x08080a, intensity: 3 },
  fog: { color: 0x161e27, near: 4, far: 24 },
  inside: { color: 0x2a6a7a, intensity: 24, distance: 8, at: [0, 1.6, 0] as Vec },
  /** A soft cold work light from the camera's side, so Mom reads as a person, not a silhouette (Kartik: "still dark as hell"). */
  fill: { color: 0xa6b8c9, intensity: 9, distance: 10, at: [2.4, 2.8, 4.2] as Vec },
  floor: 0x2a2e35,
  glassOpacity: 0.18,
  waterOpacity: 0.38,
} as const;

export const SPILLWAY = {
  fogFar: 90,
  /** The night preset's sky and moon, lifted so Mom and the bank read (Kartik: every tape was "dark as hell"). */
  hemi: 2.8,
  moon: 2.2,
  lantern: { color: 0xffb060, intensity: 14, distance: 36 },
  bank: 0x5a5348,
  /** Deep navy, a little lifted so the bank and the sky both read (stars still show). */
  sky: { top: 0x141c2e, horizon: 0x3a4660, fog: 0x1c2430 },
  waterY: -0.3,
  dam: { at: [-26, -0.3, 22] as Vec, yaw: Math.PI },
  /** The orca slips downstream (−Z) from `from` to `to` over `seconds`, fin just showing. */
  orca: { from: [-5, 3] as const, to: [-10, -10] as const, seconds: 45, finDepth: 0.35 },
} as const;

/**
 * Tape 1's orca: a slow glide across the tank that turns toward Mom (+Z) at each end. Once the
 * page "She comes to the glass..." is shown (`TANK_HOLD_PAGE`), she eases to the glass over
 * `blend` seconds and holds still facing Mom; going Back before that page releases her.
 */
export const TANK_SWIM = {
  halfWidth: 1.4,
  depth: -0.4,
  sway: 0.8,
  period: 14,
  scale: 0.4,
  centreY: 1.27,
  blend: 2,
} as const;

/** Index of the tape-1 page that brings her to the glass (checked against TAPES[1] in a test). */
export const TANK_HOLD_PAGE = 4;

/** Pure: the hold weight (0 swimming, 1 held) after `dt`, moving toward the page's target. */
export function holdStep(hold: number, page: number, dt: number, blend = TANK_SWIM.blend): number {
  const target = page >= TANK_HOLD_PAGE ? 1 : 0;
  const step = dt / blend;
  return hold < target ? Math.min(target, hold + step) : Math.max(target, hold - step);
}

const MOM_SWAY = { amplitude: 0.06, rate: 0.9 } as const;
const LAB_INTERACT_EVERY = 7;
const LANTERN_SIZE = 0.14;

/** 0..1 progress of a shot, eased, clamped once the move is done. */
export function shotProgress(elapsed: number, seconds: number): number {
  return smooth(Math.min(1, Math.max(0, elapsed / seconds)));
}

/** The red lamp's emissive intensity at time `t`: a slow, dim throb. */
export function lampPulse(t: number, pulse = LAB_LIGHT.pulse): number {
  const k = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / pulse.period);
  return pulse.min + (pulse.max - pulse.min) * k;
}

export interface Glide {
  x: number;
  z: number;
  yaw: number;
}

/** Where the young orca is at `t`: x sweeps the tank, z bows toward the glass, yaw follows; `hold` 0..1 blends to nose-at-the-glass. */
export function tankSwim(t: number, out: Glide, hold = 0, swim = TANK_SWIM): Glide {
  const w = (2 * Math.PI) / swim.period;
  out.x = swim.halfWidth * Math.sin(w * t);
  out.z = swim.depth - swim.sway * Math.cos(2 * w * t); // at the glass when x peaks
  const vx = swim.halfWidth * w * Math.cos(w * t);
  const vz = 2 * w * swim.sway * Math.sin(2 * w * t);
  out.yaw = Math.atan2(-vx, -vz); // the orca's nose points −Z at yaw 0
  if (hold <= 0) return out;
  const k = smooth(Math.min(1, hold));
  const glass = swim.depth + swim.sway; // nose to the glass, facing Mom
  const turn = Math.atan2(Math.sin(Math.PI - out.yaw), Math.cos(Math.PI - out.yaw)); // shortest way round
  out.x *= 1 - k;
  out.z += (glass - out.z) * k;
  out.yaw += turn * k;
  return out;
}

export interface Flashback {
  scene: THREE.Scene;
  /** Pose source only: the stage camera is readonly, so the player copies this one's pose. */
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  /** The tape's page changed (first open, Next or Back). */
  onPage?(index: number): void;
  dispose(): void;
}

function isMesh(node: THREE.Object3D): node is THREE.Mesh {
  return node instanceof THREE.Mesh;
}

/** Translucent: used for the tank's glass and water so the orca shows through. */
const seeThrough =
  (opacity: number) =>
  (m: THREE.MeshStandardMaterial): void => {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  };

/** Swaps the named material on `root` for an un-cached clone styled by `style` (null if absent). */
function restyle(
  root: THREE.Object3D,
  name: string,
  style: (m: THREE.MeshStandardMaterial) => void,
): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  root.traverse((node) => {
    if (!isMesh(node)) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.forEach((m, i) => {
      if (m.name !== name || !(m instanceof THREE.MeshStandardMaterial)) return;
      const own = m.clone();
      own.userData.cached = false; // Material.copy keeps userData; this clone is ours to free
      style(own);
      found = own;
      if (Array.isArray(node.material)) node.material[i] = own;
      else node.material = own;
    });
  });
  return found;
}

function hemi(scene: THREE.Scene, c: { sky: number; ground: number; intensity: number }): void {
  scene.add(new THREE.HemisphereLight(c.sky, c.ground, c.intensity));
}

function point(
  scene: THREE.Scene,
  c: { color: number; intensity?: number; distance: number; at?: Vec },
): THREE.PointLight {
  const light = new THREE.PointLight(c.color, c.intensity ?? 0, c.distance, 2);
  if (c.at) light.position.set(...c.at);
  scene.add(light);
  return light;
}

/** Dark room: background and fog share one colour so the open side vanishes. */
function darkRoom(scene: THREE.Scene, fog: { color: number; near: number; far: number }): void {
  scene.background = new THREE.Color(fog.color);
  scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
}

function placeMom(mom: Character, x: number, z: number, yaw: number, rest: string): void {
  mom.group.position.set(x, 0, z);
  mom.group.rotation.y = yaw;
  mom.rest = rest;
  mom.play(rest);
}

/** The young orca, scaled and centred on its own pivot so it can be placed by its middle. */
interface Orca {
  pivot: THREE.Group;
  mixer: THREE.AnimationMixer;
  dispose(): void;
}

function youngOrca(asset: SkinnedAsset, scale: number): Orca {
  const body = clone(asset.scene);
  body.traverse((n) => (n.frustumCulled = false));
  const centre = new THREE.Box3().setFromObject(body).getCenter(new THREE.Vector3());
  body.position.copy(centre).negate();
  const pivot = new THREE.Group();
  pivot.scale.setScalar(scale);
  pivot.add(body);
  const mixer = new THREE.AnimationMixer(body);
  mixer.clipAction(findClip(asset.clips, 'Swim')).play();
  const dispose = (): void => {
    mixer.stopAllAction();
    mixer.uncacheRoot(body);
  };
  return { pivot, mixer, dispose };
}

function makeCamera(shot: Shot): {
  camera: THREE.PerspectiveCamera;
  move: (elapsed: number) => void;
} {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
  const from = new THREE.Vector3(...shot.from);
  const to = new THREE.Vector3(...shot.to);
  const look = new THREE.Vector3(...shot.look);
  const move = (elapsed: number): void => {
    camera.position.lerpVectors(from, to, shotProgress(elapsed, shot.seconds));
    camera.lookAt(look);
  };
  move(0);
  return { camera, move };
}

function finish(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  tick: (dt: number) => void,
  free: () => void,
  onPage?: (index: number) => void,
): Flashback {
  let freed = false;
  return {
    scene,
    camera,
    update: tick,
    onPage,
    dispose() {
      if (freed) return;
      freed = true;
      free();
      disposeScene(scene);
    },
  };
}

/** Day 41: the lab at night. Mom at the bench, the open cage beside her, the red lamp throbbing. */
async function buildLab(): Promise<Flashback> {
  const [lab, cage, momAsset] = await Promise.all([
    loadModel(propUrl('lab')),
    loadModel(propUrl('cage')),
    loadSkinned(characterUrl('mom')),
  ]);
  const scene = new THREE.Scene();
  darkRoom(scene, LAB_LIGHT.fog);
  hemi(scene, LAB_LIGHT.ambient);
  point(scene, LAB_LIGHT.monitors);
  point(scene, LAB_LIGHT.fill);
  const lampLight = point(scene, LAB_LIGHT.lamp);
  const lamp = restyle(lab, 'Lamp', (m) => (m.emissiveIntensity = LAB_LIGHT.pulse.min));
  restyle(lab, 'Screen', (m) => (m.emissiveIntensity = LAB_LIGHT.screenGlow));
  cage.position.set(1.8, 0.94, -2.45);
  const mom = createCharacter(momAsset, new THREE.Group());
  placeMom(mom, LAB_MOM.x, LAB_MOM.z, LAB_MOM.yaw, 'Idle_Neutral');
  scene.add(lab, cage, mom.group, makeMic(), makeMonitor());
  const { camera, move } = makeCamera(SHOTS[2]);
  let t = 0;
  let nextGesture = LAB_INTERACT_EVERY;
  const tick = (dt: number): void => {
    t += dt;
    move(t);
    mom.update(dt);
    const glow = lampPulse(t);
    if (lamp) lamp.emissiveIntensity = glow;
    lampLight.intensity = glow;
    if (t < nextGesture) return;
    nextGesture = t + LAB_INTERACT_EVERY;
    mom.play('Interact', true);
  };
  return finish(scene, camera, tick, () => mom.dispose());
}

/** Day 12: Mom sings at the tank; the young orca comes to the glass and holds for her naming. */
async function buildTank(): Promise<Flashback> {
  const [tank, momAsset, orcaAsset] = await Promise.all([
    loadModel(propUrl('tank')),
    loadSkinned(characterUrl('mom')),
    loadSkinned(characterUrl('orca')),
  ]);
  const scene = new THREE.Scene();
  darkRoom(scene, TANK_LIGHT.fog);
  hemi(scene, TANK_LIGHT.ambient);
  point(scene, TANK_LIGHT.inside);
  point(scene, TANK_LIGHT.fill);
  restyle(tank, 'Glass', seeThrough(TANK_LIGHT.glassOpacity));
  restyle(tank, 'Water', seeThrough(TANK_LIGHT.waterOpacity));
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ color: TANK_LIGHT.floor }),
  );
  floor.rotation.x = -Math.PI / 2;
  const mom = createCharacter(momAsset, new THREE.Group());
  placeMom(mom, 0, 2.2, Math.PI, 'Idle_Neutral');
  const orca = youngOrca(orcaAsset, TANK_SWIM.scale);
  orca.pivot.position.y = TANK_SWIM.centreY;
  scene.add(floor, tank, mom.group, orca.pivot);
  const { camera, move } = makeCamera(SHOTS[1]);
  const glide: Glide = { x: 0, z: 0, yaw: 0 };
  let t = 0;
  let page = 0;
  let hold = 0;
  const tick = (dt: number): void => {
    hold = holdStep(hold, page, dt);
    t += dt;
    move(t);
    mom.update(dt);
    orca.mixer.update(dt);
    mom.group.rotation.y = Math.PI + MOM_SWAY.amplitude * Math.sin(MOM_SWAY.rate * t);
    tankSwim(t, glide, hold);
    orca.pivot.position.x = glide.x;
    orca.pivot.position.z = glide.z;
    orca.pivot.rotation.y = glide.yaw;
  };
  return finish(
    scene,
    camera,
    tick,
    () => {
      mom.dispose();
      orca.dispose();
    },
    (index) => {
      page = index;
    },
  );
}

function makeLantern(): THREE.Group {
  const lantern = new THREE.Group();
  const { color, intensity, distance } = SPILLWAY.lantern;
  lantern.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(LANTERN_SIZE, LANTERN_SIZE * 1.7, LANTERN_SIZE),
      new THREE.MeshBasicMaterial({ color, fog: false }),
    ),
    new THREE.PointLight(color, intensity, distance, 2),
  );
  return lantern;
}

/** The river bank (a slab, so its edge has a face) and the water running off into the fog. */
function addSpillwayGround(scene: THREE.Scene): void {
  const bank = new THREE.Mesh(
    new THREE.BoxGeometry(400, 0.4, 400),
    new THREE.MeshLambertMaterial({ color: SPILLWAY.bank }),
  );
  bank.position.set(200, -0.2, 0);
  const water = createWaterMesh(400, 400, RIVER_FLOW);
  water.position.set(-199.5, SPILLWAY.waterY, 0);
  scene.add(bank, water);
}

/** Last tape: night at the spillway. Mom with her lantern at the edge; the fin slips downstream. */
async function buildSpillway(): Promise<Flashback> {
  const [dam, momAsset, orcaAsset] = await Promise.all([
    loadModel(propUrl('dam')),
    loadSkinned(characterUrl('mom')),
    loadSkinned(characterUrl('orca')),
  ]);
  const scene = new THREE.Scene();
  const lights = createWorldLights(scene);
  const { night } = LIGHTING;
  applyLighting(lights, {
    ...night,
    skyTop: SPILLWAY.sky.top,
    skyHorizon: SPILLWAY.sky.horizon,
    fog: { ...night.fog, color: SPILLWAY.sky.fog, far: SPILLWAY.fogFar },
    hemi: { ...night.hemi, intensity: SPILLWAY.hemi },
    key: { ...night.key, intensity: SPILLWAY.moon },
  });
  addSpillwayGround(scene);
  dam.position.set(...SPILLWAY.dam.at);
  dam.rotation.y = SPILLWAY.dam.yaw;
  const mom = createCharacter(momAsset, makeLantern());
  mom.pack.visible = true;
  placeMom(mom, 1.2, 0, -Math.PI / 2, 'Idle_Neutral');
  const orca = youngOrca(orcaAsset, 1);
  const { from, to, seconds, finDepth } = SPILLWAY.orca;
  const finTop = new THREE.Box3().setFromObject(orca.pivot).max.y;
  orca.pivot.position.set(from[0], SPILLWAY.waterY - finTop + finDepth, from[1]);
  scene.add(dam, mom.group, orca.pivot);
  const { camera, move } = makeCamera(SHOTS[3]);
  lights.sky.position.set(camera.position.x, 0, camera.position.z);
  let t = 0;
  const tick = (dt: number): void => {
    t += dt;
    move(t);
    mom.update(dt);
    orca.mixer.update(dt);
    const k = shotProgress(t, seconds);
    orca.pivot.position.x = from[0] + (to[0] - from[0]) * k;
    orca.pivot.position.z = from[1] + (to[1] - from[1]) * k;
  };
  return finish(scene, camera, tick, () => {
    mom.dispose();
    orca.dispose();
  });
}

const BUILDERS: Readonly<Record<Tape, () => Promise<Flashback>>> = {
  1: buildTank,
  2: buildLab,
  3: buildSpillway,
};

/** Builds a tape's flashback and compiles its shaders, so the first frame doesn't hitch. */
export async function buildFlashback(tape: Tape, ctx: DreamContext): Promise<Flashback> {
  const flashback = await BUILDERS[tape]();
  await ctx.stage.renderer.compileAsync(flashback.scene, flashback.camera);
  return flashback;
}
