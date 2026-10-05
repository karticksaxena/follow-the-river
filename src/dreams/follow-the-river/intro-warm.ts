import type * as THREE from 'three/webgpu';
import { drawBehind } from '../../engine/frames';
import type { DreamContext } from '../types';
import { AT, YAW_EAST, YAW_TO_TV, type IntroScene } from './intro-scene';
import { unculled } from './warm';

/** Where the intro's camera stands (x, z, yaw), in the order the warm-up draws them: the river first, the room (the start view) last. */
export const WARM_SPOTS = [
  { x: AT.spawnRiver.x, z: AT.spawnRiver.z, yaw: YAW_EAST },
  { x: AT.spawnRoom.x, z: AT.spawnRoom.z, yaw: YAW_TO_TV },
] as const;
/** The orca shows this far (m) out from Mom's spot at the water's edge. */
const ORCA_OUT = 3;
/** Real frames drawn per spot. */
const SPOT_FRAMES = 3;
/** A time (s) past the news screen's redraw interval, so its re-upload runs once now. */
const NEWS_TIME = 1;

type Undo = () => void;

/** Everything the intro shows later is on: the pack, the phone, the orca with her breath and pack. Returns the undo. */
function showAhead(sc: IntroScene): Undo {
  const shown = [sc.mom.pack, sc.phone];
  const before = shown.map((o) => o.visible);
  for (const o of shown) o.visible = true;
  const undoFish = sc.fish.warmShow(AT.momRiver.x + ORCA_OUT, AT.momRiver.z);
  return () => {
    shown.forEach((o, i) => (o.visible = before[i] ?? false));
    undoFish();
  };
}

/** Exact camera position and rotation back; returns the undo. */
function keepCamera(camera: THREE.PerspectiveCamera): Undo {
  const { x, y, z } = camera.position;
  const { x: rx, y: ry, z: rz } = camera.rotation;
  return () => {
    camera.position.set(x, y, z);
    camera.rotation.set(rx, ry, rz, 'YXZ');
  };
}

/**
 * Behind black, draws real frames from every spot the intro will show (the river bank as well as the
 * room), with the later arrivals on (pack, phone, orca) and culling off, so nothing first draws,
 * uploads or compiles mid-scene ("An hour later" shows the pack; the outside shows the whole bank).
 * The news screen's redraw upload runs once too. The camera is put back; never throws.
 */
export async function warmIntro(ctx: DreamContext, sc: IntroScene): Promise<void> {
  const { stage, player } = ctx;
  const undo: Undo[] = [keepCamera(stage.camera), unculled(sc.scene), showAhead(sc)];
  try {
    stage.renderer.initTexture(sc.news.texture);
    sc.news.update(NEWS_TIME);
    for (const s of WARM_SPOTS) {
      player.teleport(s.x, s.z, s.yaw);
      await drawBehind(stage, SPOT_FRAMES);
    }
  } catch {
    // a warm-up must never stop the intro
  } finally {
    for (const u of undo.toReversed()) u();
  }
}
