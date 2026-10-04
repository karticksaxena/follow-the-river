import * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';
import type { EndingScene } from './ending-scene';
import { facing, stopShort } from './ending-scene';
import { propUrl } from './kits';
import { shoreY, WATER_Y } from './river';
import type { Run, Systems } from './run';
import { spend } from './state';

/**
 * The orca's end (Plan 7): its last leap strands it on the pebbles beside Mom, too sick to get
 * back. Mom sings it the song from the lab and it answers; you put your hand on it; you lay your
 * last fish pack on the water beside it, and it is still. Tuning knobs (m, s, volume).
 */
export const FAREWELL = {
  /** Where its nose comes to rest, from Mom's spot (x) and from the water line (z, up the shore). */
  nose: { fromMom: 4.5, upShore: 3.5 },
  /** Where you stand to touch it (beside its head, on the pebbles: its middle lies at the water line). */
  side: { x: -1.7, z: -1.6, radius: 2.4 },
  /** Where you lay the pack: at the water's edge beside it, and where it floats. */
  edge: { x: -1.8, z: 1.2, radius: 2.4 },
  float: { x: -1.2, z: -1 },
  cryVolume: 0.8,
  answerVolume: 0.35,
} as const;

export const FAREWELL_PAGES = {
  stranded: [
    'Mom: "No. No, no, no..."',
    'Mom: "It was eating the sickness for us. Every one it took, it took the sickness too."',
    'Mom: "It held on for us. It held on for you."',
  ],
  song: [
    'Mom: "Mm-mm. Mm-mm-mm."',
    'She hums the song from the lab, the one it learned through the glass.',
  ],
  answer: ['It answers her. Once, softly.'],
  hand: [
    'Its skin is cold and rough under your hand.',
    'Mom puts her hand next to yours. Neither of you says anything.',
  ],
  pack: [
    'You set your last fish pack on the water beside it.',
    'It breathes out once, long and slow. Then it is still.',
  ],
} as const;

/** What the farewell needs from the running ending. */
export interface Script {
  sys: Systems;
  run: Run;
  scene: EndingScene;
  until(pred: (dt: number) => boolean): Promise<void>;
  read(pages: readonly string[]): Promise<void>;
  readonly cancelled: boolean;
}

export interface Shore {
  /** The orca's nose on the shore, and the water line (z). */
  noseX: number;
  noseZ: number;
  lakeZ: number;
}

/** Pure: where everything happens, from Mom's meeting spot and the lake. */
export function shoreFor(mom: { x: number; z: number }, lakeZ: number): Shore {
  return { noseX: mom.x + FAREWELL.nose.fromMom, noseZ: lakeZ + FAREWELL.nose.upShore, lakeZ };
}

/** Its last leap onto the pebbles; the zombies still on the bank go into the water with the wave. */
export async function strand(s: Script, at: Shore): Promise<void> {
  const { fish, horde, ctx, sounds } = s.sys;
  fish.strand(at.noseX, at.noseZ, (z) => shoreY(z - at.lakeZ), horde);
  horde.forEachAlive((id) => horde.takeByFish(id));
  await s.until(() => fish.beached);
  if (s.cancelled) return;
  ctx.audio.once(sounds.orcaCry, FAREWELL.cryVolume);
}

/** Mom goes to its head and kneels by it. */
export async function goToIt(s: Script, at: Shore): Promise<void> {
  const { actor, mom } = s.scene;
  const head = { x: at.noseX - 1.3, z: at.noseZ + 0.6 };
  actor.stop(); // no more tense glances and gestures: she only has eyes for it now
  mom.rest = 'Kneel'; // she kneels where the walk ends
  await actor.walkTo([head]);
  if (!s.cancelled) actor.faceTo(at.noseX, at.noseZ - 1);
}

/** The song from the lab, and its answer: a soft cry and one last red breath. */
export async function song(s: Script): Promise<void> {
  await s.read(FAREWELL_PAGES.song);
  if (s.cancelled) return;
  s.sys.ctx.audio.once(s.sys.sounds.orcaCry, FAREWELL.answerVolume);
  await s.read(FAREWELL_PAGES.answer);
}

/** Waits for E within `radius` of `at`, showing `prompt` (see Run.interact). */
function waitForE(
  s: Script,
  at: { x: number; z: number },
  radius: number,
  prompt: string,
): Promise<void> {
  return new Promise((resolve) => {
    s.run.interact = {
      at,
      radius,
      prompt,
      use: () => {
        s.run.interact = null;
        resolve();
      },
    };
  });
}

/** You put your hand on its side; Mom comes and puts hers beside it. */
export async function hand(s: Script, at: Shore): Promise<void> {
  const side = { x: at.noseX + FAREWELL.side.x, z: at.noseZ + FAREWELL.side.z };
  await waitForE(s, side, FAREWELL.side.radius, 'E: put your hand on it');
  if (s.cancelled) return;
  s.sys.flashlight.on = false; // this close the beam only glares: Mom's lantern lights it
  const cam = s.sys.ctx.stage.camera;
  cam.rotation.set(
    -0.35,
    facing(cam.position.x, cam.position.z, at.noseX, at.noseZ - 3.5) + Math.PI,
    0,
    'YXZ',
  );
  const { actor, mom } = s.scene;
  // She comes to kneel beside you (her rest is still Kneel, so she kneels where the walk ends).
  void actor.walkTo([stopShort(mom.group.position, cam.position, 0.9)]).then(() => {
    if (!s.cancelled) actor.faceTo(at.noseX, at.noseZ - 3.5);
  });
  await s.read(FAREWELL_PAGES.hand);
}

/** A fish pack bobbing on the water by its side (loaded now, shown by `pack`). */
export async function loadPackOnWater(scene: THREE.Scene): Promise<THREE.Object3D> {
  const pack = await loadModel(propUrl('fishpack'));
  pack.visible = false;
  scene.add(pack);
  return pack;
}

/** You lay your last fish pack on the water; it breathes out one last time and is still. */
export async function lastPack(s: Script, at: Shore, pack: THREE.Object3D): Promise<void> {
  const edge = { x: at.noseX + FAREWELL.edge.x, z: at.lakeZ + FAREWELL.edge.z };
  await waitForE(s, edge, FAREWELL.edge.radius, 'E: lay your last fish pack on the water');
  if (s.cancelled) return;
  const left = spend(s.run.live.supplies, 'fishPacks', 1);
  if (left) s.run.live.supplies = left; // with none left, it is the one Mom brought
  s.scene.mom.pack.visible = left === null ? false : s.scene.mom.pack.visible;
  pack.position.set(at.noseX + FAREWELL.float.x, WATER_Y + 0.05, at.lakeZ + FAREWELL.float.z);
  pack.visible = true;
  s.sys.fish.breatheOut();
  await s.read(FAREWELL_PAGES.pack);
}
