import type { Vec3 } from '../../engine/ray';
import { playSplash } from './fish-sound';
import type { FishState } from './fish-state';
import { EDGE_X, WATER_Y } from './river';

/** The pack you throw to her: its flight, the splash where it lands, and the take that follows. */
const PACK_DISTANCE = 4;
const PACK_TIME = 1;
const PACK_ARC = 1.2;

export function stepPack(f: FishState, dt: number): void {
  f.packT += dt;
  const s = Math.min(1, f.packT / PACK_TIME);
  f.packModel.position.lerpVectors(f.packFrom, f.packTo, s);
  f.packModel.position.y += PACK_ARC * 4 * s * (1 - s);
  f.packModel.rotation.y += 6 * dt;
  if (s < 1) return;
  f.packT = -1;
  f.packModel.visible = false;
  playSplash(f, f.packTo.x, f.packTo.z);
  f.takePending = true;
}

export function feedFish(f: FishState, from: Vec3): void {
  f.packFrom.set(from.x, from.y, from.z);
  f.packTo.set(EDGE_X + PACK_DISTANCE, WATER_Y, from.z);
  f.packT = 0;
  f.packModel.visible = true;
  f.packModel.position.copy(f.packFrom);
}
