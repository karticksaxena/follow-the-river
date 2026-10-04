import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import { disposeScene } from '../../engine/dispose';
import { loadModel, loadSkinned, type SkinnedAsset } from '../../engine/models';
import type { DreamContext } from '../types';
import { findClip, smooth } from './fish-parts';
import { createMom, type Mom } from './intro-scene';
import { characterUrl, propUrl } from './kits';
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
  // Lab (tape 2): Mom's back at the bench, the cage and the red lamp over her shoulder.
  2: { from: [2.6, 1.75, 1.6], to: [2.0, 1.65, 1.0], look: [0.2, 1.1, -2.5], seconds: 40 },
  // Spillway: behind Mom on the bank, looking out over the river.
  3: { from: [4.5, 1.9, 1.5], to: [4.0, 1.8, 1.0], look: [-6, 0.4, -4], seconds: 45 },
};

/** Never bright: dim cold ambience, one warm or red practical per shot. */
export const LAB_LIGHT = {
  ambient: { sky: 0x202c34, ground: 0x08080a, intensity: 0.4 },
  fog: { color: 0x05060a, near: 2, far: 16 },
  monitors: { color: 0x3a5a86, intensity: 0.9, distance: 5, at: [-0.5, 1.5, -2.2] as Vec },
  lamp: { color: 0xff2010, distance: 7, at: [2.6, 2.4, -2.7] as Vec },
  /** Red lamp pulse: emissive intensity swings between `min` and `max` every `period` seconds. */
  pulse: { min: 0.15, max: 1.3, period: 2.4 },
  screenGlow: 0.5,
} as const;

export const TANK_LIGHT = {
  ambient: { sky: 0x1a262e, ground: 0x08080a, intensity: 0.35 },
  fog: { color: 0x04070a, near: 3, far: 18 },
  inside: { color: 0x2a6a7a, intensity: 7, distance: 8, at: [0, 1.6, 0] as Vec },
  glassOpacity: 0.18,
  waterOpacity: 0.38,
} as const;

export const SPILLWAY = {
  fogFar: 90,
  lantern: { color: 0xffb060, intensity: 2.5, distance: 10 },
  bank: 0x3a352e,
  waterY: -0.3,
  dam: { at: [-26, -0.3, 22] as Vec, yaw: Math.PI },
  /** The orca slips downstream (−Z) from `from` to `to` over `seconds`, fin just showing. */
  orca: { from: [-5, 3] as const, to: [-10, -10] as const, seconds: 45, finDepth: 0.35 },
} as const;

/**
 * Tape 1's orca: a slow glide across the tank that turns toward Mom (+Z) at each end, then comes
 * to the glass and holds still facing her (`holdFrom`..`holdTo`, s) while Mom names her; it eases
 * into and out of the hold over `blend` seconds.
 */
export const TANK_SWIM = {
  halfWidth: 1.4,
  depth: -0.4,
  sway: 0.8,
  period: 14,
  scale: 0.4,
  centreY: 1.27,
  holdFrom: 18,
  holdTo: 30,
  blend: 2,
} as const;

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

/** 0..1: how far into the hold the glide is at `t` (eased in before `holdFrom`, out after `holdTo`). */
function holdWeight(t: number, swim: typeof TANK_SWIM): number {
  const into = (t - (swim.holdFrom - swim.blend)) / swim.blend;
  const out = (swim.holdTo + swim.blend - t) / swim.blend;
  return smooth(Math.min(1, Math.max(0, Math.min(into, out))));
}

/** Where the young orca is at `t`: x sweeps the tank, z bows toward the glass, yaw follows. */
export function tankSwim(t: number, out: Glide, swim = TANK_SWIM): Glide {
  const w = (2 * Math.PI) / swim.period;
  out.x = swim.halfWidth * Math.sin(w * t);
  out.z = swim.depth - swim.sway * Math.cos(2 * w * t); // at the glass when x peaks
  const vx = swim.halfWidth * w * Math.cos(w * t);
  const vz = 2 * w * swim.sway * Math.sin(2 * w * t);
  out.yaw = Math.atan2(-vx, -vz); // the orca's nose points −Z at yaw 0
  const k = holdWeight(t, swim);
  if (k === 0) return out;
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

function placeMom(mom: Mom, x: number, z: number, yaw: number, rest: string): void {
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
): Flashback {
  let freed = false;
  return {
    scene,
    camera,
    update: tick,
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
  const lampLight = point(scene, LAB_LIGHT.lamp);
  const lamp = restyle(lab, 'Lamp', (m) => (m.emissiveIntensity = LAB_LIGHT.pulse.min));
  restyle(lab, 'Screen', (m) => (m.emissiveIntensity = LAB_LIGHT.screenGlow));
  cage.position.set(1.8, 0.94, -2.45);
  const mom = createMom(momAsset, new THREE.Group());
  placeMom(mom, -0.6, -1.75, Math.PI, 'Idle_Neutral');
  scene.add(lab, cage, mom.group);
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
  restyle(tank, 'Glass', seeThrough(TANK_LIGHT.glassOpacity));
  restyle(tank, 'Water', seeThrough(TANK_LIGHT.waterOpacity));
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ color: 0x0c0d10 }),
  );
  floor.rotation.x = -Math.PI / 2;
  const mom = createMom(momAsset, new THREE.Group());
  placeMom(mom, 0, 2.2, Math.PI, 'Idle_Neutral');
  const orca = youngOrca(orcaAsset, TANK_SWIM.scale);
  orca.pivot.position.y = TANK_SWIM.centreY;
  scene.add(floor, tank, mom.group, orca.pivot);
  const { camera, move } = makeCamera(SHOTS[1]);
  const glide: Glide = { x: 0, z: 0, yaw: 0 };
  let t = 0;
  const tick = (dt: number): void => {
    t += dt;
    move(t);
    mom.update(dt);
    orca.mixer.update(dt);
    mom.group.rotation.y = Math.PI + MOM_SWAY.amplitude * Math.sin(MOM_SWAY.rate * t);
    tankSwim(t, glide);
    orca.pivot.position.x = glide.x;
    orca.pivot.position.z = glide.z;
    orca.pivot.rotation.y = glide.yaw;
  };
  return finish(scene, camera, tick, () => {
    mom.dispose();
    orca.dispose();
  });
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
  applyLighting(lights, { ...night, fog: { ...night.fog, far: SPILLWAY.fogFar } });
  addSpillwayGround(scene);
  dam.position.set(...SPILLWAY.dam.at);
  dam.rotation.y = SPILLWAY.dam.yaw;
  const mom = createMom(momAsset, makeLantern());
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
