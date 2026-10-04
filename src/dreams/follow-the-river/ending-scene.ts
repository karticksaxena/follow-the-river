import * as THREE from 'three/webgpu';
import { loadSkinned } from '../../engine/models';
import { loadArm } from './farewell-arm';
import { TORCH_EXPOSURE, WATCH } from './flashlight';
import { createCharacter, type Character } from './intro-scene';
import { characterUrl } from './kits';
import { createMomActor, type MomActor, type Pt } from './mom-actor';
import { lookAt, reach } from './rig';
import { EDGE_X, shoreY } from './river';
import type { Systems } from './run';

/** Tuning knobs. Mom's lantern is the chapter's lantern, beside her on the pebbles. */
export const MOM_LANTERN = { intensity: 1.6, distance: 14, height: 1.3 } as const;
const LANTERN_SIZE = { width: 0.14, height: 0.24 } as const;
const LANTERN_COLOR = 0xc07a30; // dim, so bloom only haloes it
const LANTERN_GLOW_UP = 0.05;
/** The light hangs this far (m) out from the lantern toward the camera: a point light right against her arm, hand and dress is a 1/d² hot spot that blooms. */
export const LANTERN_OUT = 0.45;
const lamp = new THREE.Vector3();

/**
 * Pure: where the lantern's light goes, `LANTERN_OUT` m from `hand`. Outward from her body axis
 * `body` through the hand (so it never crosses her torso), or toward `cam` when that also points
 * away from the axis (the light then faces the player). Writes `out`.
 */
export function lanternSpot(
  hand: { x: number; y: number; z: number },
  body: { x: number; z: number },
  cam: { x: number; z: number },
  out: { x: number; y: number; z: number },
): typeof out {
  const rx = hand.x - body.x;
  const rz = hand.z - body.z;
  const cx = cam.x - hand.x;
  const cz = cam.z - hand.z;
  const rl = Math.hypot(rx, rz);
  const cl = Math.hypot(cx, cz);
  const toCam = cl > 1e-6 && cx * rx + cz * rz > 0;
  const [ux, uz] = toCam ? [cx / cl, cz / cl] : rl > 1e-6 ? [rx / rl, rz / rl] : [0, 1];
  out.x = hand.x + ux * LANTERN_OUT;
  out.y = hand.y + LANTERN_GLOW_UP;
  out.z = hand.z + uz * LANTERN_OUT;
  return out;
}

/** The yaw that points a model's +Z from `(x, z)` toward `(toX, toZ)`. */
export function facing(x: number, z: number, toX: number, toZ: number): number {
  return Math.atan2(toX - x, toZ - z);
}

/** Shore limits for Mom's retreat (metres): never in the water, never off the pebbles. */
export const SHORE = { backOff: 2, lakeMargin: 1, edgeMargin: 0.5, meet: 1.5 } as const;

/** Pure: where Mom backs off to — `backOff` m toward the water, clamped onto the pebble shore. */
export function retreatPoint(meet: Pt, lakeZ: number): Pt {
  return {
    x: Math.min(meet.x, EDGE_X - SHORE.edgeMargin),
    z: Math.max(meet.z - SHORE.backOff, lakeZ + SHORE.lakeMargin),
  };
}

/** Pure: the spot `gap` m short of `to` on the line from `from` (or `from` itself if closer). */
export function stopShort(from: Pt, to: Pt, gap: number): Pt {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d <= gap) return { x: from.x, z: from.z };
  const k = (d - gap) / d;
  return { x: from.x + dx * k, z: from.z + dz * k };
}

/** What the farewell has people reach for and look at (live references, read each frame; null: nothing). */
export interface Aim {
  momHand: THREE.Vector3 | null;
  kartikHand: THREE.Vector3 | null;
  momGaze: THREE.Vector3 | null;
  kartikGaze: THREE.Vector3 | null;
}

/** How far a head turns (rad). */
const GAZE_LIMITS = { yaw: 1.2, pitch: 0.7 } as const;
const GAZE_EASE = 4;
/** Elbow pole in the character's own frame (+x is his left, +z ahead): out to the side, up, and behind. */
const POLE = { left: [0.5, 0.5, -0.5], right: [-0.5, 0.5, -0.5] } as const;
const pole = new THREE.Vector3();

interface Gaze {
  share: number;
  last: THREE.Vector3 | null;
}

/** Eases a head toward its target (and back to the animation when there is none). */
function gaze(head: THREE.Object3D, now: THREE.Vector3 | null, g: Gaze, dt: number): void {
  if (now) g.last = now;
  g.share += ((now ? 1 : 0) - g.share) * (1 - Math.exp(-GAZE_EASE * dt));
  if (g.last && g.share > 0.01) lookAt(head, g.last, g.share, GAZE_LIMITS);
}

/** An arm to a point: shoulder, elbow, hand bones on `who` (`L` or `R`). */
function armTo(who: Character, side: 'L' | 'R', target: THREE.Vector3): void {
  const p = side === 'L' ? POLE.left : POLE.right;
  who.group.localToWorld(pole.set(p[0], p[1], p[2]));
  reach(
    who.bone(`UpperArm${side}`),
    who.bone(`LowerArm${side}`),
    who.bone(`Wrist${side}`),
    target,
    pole,
  );
}

export interface EndingScene {
  mom: Character;
  actor: MomActor;
  /** Kartik's own body (hidden until the orbit shows it) and his first-person arm (a child of the camera, hidden). */
  kartik: Character;
  arm: THREE.Object3D;
  aim: Aim;
  /** Sets Mom's lantern down at `at` (world): the mesh leaves her hand and the light stays with it. */
  setDown(at: { x: number; y: number; z: number }): void;
  /** Per frame: Mom's walk/idle, her animation, and the lantern in her hand. */
  update(dt: number): void;
  /** Puts Mom on the shore facing `(toX, toZ)` and lights the lantern in her hand. */
  place(toX: number, toZ: number, lantern: THREE.PointLight): void;
  /** Hides Mom and gives the lantern back where it was. */
  remove(lantern: THREE.PointLight): void;
  dispose(): void;
}

function makeLantern(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(LANTERN_SIZE.width, LANTERN_SIZE.height, LANTERN_SIZE.width),
    new THREE.MeshBasicMaterial({ color: LANTERN_COLOR, fog: false }),
  );
}

/** Mom (loaded now, while the screen is black) with the lantern beside her, parked until `place`. */
export async function buildEndingScene(sys: Systems): Promise<EndingScene> {
  const spot = sys.area.meetAt;
  if (!spot) throw new Error('the ending needs a meeting spot (meetAt)');
  const lakeZ = sys.area.lake?.z ?? null;
  const [momAsset, kartikAsset, arm] = await Promise.all([
    loadSkinned(characterUrl('mom')),
    loadSkinned(characterUrl('kartik')),
    loadArm(),
  ]);
  const mom = createCharacter(momAsset, makeLantern());
  const kartik = createCharacter(kartikAsset);
  mom.group.visible = false;
  kartik.group.visible = false;
  kartik.rest = 'Kneel';
  sys.world.scene.add(mom.group, kartik.group);
  sys.ctx.stage.camera.add(arm);
  const aim: Aim = { momHand: null, kartikHand: null, momGaze: null, kartikGaze: null };
  const eyes = { mom: { share: 0, last: null } as Gaze, kartik: { share: 0, last: null } as Gaze };
  const heads = { mom: mom.bone('Head'), kartik: kartik.bone('Head') };
  const home = new THREE.Vector3();
  const actor = createMomActor(mom);
  let held: THREE.PointLight | null = null;
  return {
    mom,
    actor,
    kartik,
    arm,
    aim,
    setDown(at) {
      const can = mom.pack;
      can.removeFromParent(); // out of her hand, onto the pebbles
      can.scale.setScalar(1);
      can.position.set(at.x, at.y, at.z);
      can.visible = true;
      sys.world.scene.add(can);
    },
    update(dt) {
      actor.update(dt);
      mom.update(dt);
      kartik.update(dt);
      gaze(heads.mom, aim.momGaze, eyes.mom, dt);
      gaze(heads.kartik, aim.kartikGaze, eyes.kartik, dt);
      if (aim.momHand) armTo(mom, 'L', aim.momHand);
      if (aim.kartikHand && kartik.group.visible) armTo(kartik, 'R', aim.kartikHand);
      // Her feet follow the pebble shore where it slopes toward the water.
      if (lakeZ !== null) mom.group.position.y = shoreY(mom.group.position.z - lakeZ);
      if (held) {
        mom.pack.getWorldPosition(lamp); // the lantern mesh rides her right hand
        lanternSpot(lamp, mom.group.position, sys.ctx.stage.camera.position, held.position);
      }
      sys.flashlight.clearWatch(WATCH.mom);
      if (mom.group.visible) {
        const { x, z } = mom.group.position;
        sys.flashlight.watch(WATCH.mom, x, mom.group.position.y + TORCH_EXPOSURE.chest, z);
      }
    },
    place(toX, toZ, lantern) {
      actor.stop();
      mom.group.position.set(spot.x, 0, spot.z);
      mom.group.rotation.y = facing(spot.x, spot.z, toX, toZ);
      actor.faceTo(toX, toZ);
      actor.idleTense([
        { x: toX, z: toZ + 12 },
        { x: toX, z: toZ },
      ]); // anxious: up the bank, then at you
      held = lantern;
      mom.pack.visible = true;
      mom.group.visible = true;
      home.copy(lantern.position);
      lantern.position.set(spot.x + 0.5, MOM_LANTERN.height, spot.z);
      lantern.distance = MOM_LANTERN.distance;
      lantern.intensity = MOM_LANTERN.intensity;
    },
    remove(lantern) {
      actor.stop();
      held = null;
      kartik.group.visible = false;
      arm.visible = false;
      mom.attach(mom.pack, 'WristR'); // back in her hand if she had set it down
      mom.pack.visible = false;
      aim.momHand = aim.kartikHand = aim.momGaze = aim.kartikGaze = null;
      sys.flashlight.clearWatch(WATCH.mom);
      mom.group.visible = false;
      lantern.position.copy(home);
    },
    dispose() {
      sys.flashlight.clearWatch(WATCH.mom);
      arm.removeFromParent();
      mom.dispose();
      kartik.dispose();
    },
  };
}
