import * as THREE from 'three/webgpu';
import { loadSkinned } from '../../engine/models';
import { TORCH_EXPOSURE, WATCH } from './flashlight';
import { createMom, type Mom } from './intro-scene';
import { characterUrl } from './kits';
import { createMomActor, type MomActor, type Pt } from './mom-actor';
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

export interface EndingScene {
  mom: Mom;
  actor: MomActor;
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
  const mom = createMom(await loadSkinned(characterUrl('mom')), makeLantern());
  mom.group.visible = false;
  sys.world.scene.add(mom.group);
  const home = new THREE.Vector3();
  const actor = createMomActor(mom);
  let held: THREE.PointLight | null = null;
  return {
    mom,
    actor,
    update(dt) {
      actor.update(dt);
      mom.update(dt);
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
      mom.group.visible = false;
      lantern.position.copy(home);
    },
    dispose: () => mom.dispose(),
  };
}
