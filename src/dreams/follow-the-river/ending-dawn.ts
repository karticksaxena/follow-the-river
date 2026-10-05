import type * as THREE from 'three/webgpu';
import { precompileSky } from '../../engine/sky';
import type { AreaDef } from './areas/types';
import { createDawn, DAWN } from './dawn';
import { walkWithin, type Bed } from './ending-farewell';
import { meetPoint, type EndingScene } from './ending-scene';
import { LIGHTING, type LightPreset } from './lighting';
import type { Systems } from './run';

/** What the dawn needs from the running ending. */
export interface Dawning {
  sys: Systems;
  lantern: THREE.PointLight;
  scene: EndingScene | null;
  /** The dawn's looping beds (birds, water): added here, stopped by the ending. */
  beds: Bed[];
  until(pred: (dt: number) => boolean): Promise<void>;
}

/** Night 3's own night: the area's tighter fog, as `setFogFar` left it. Built once per dawn. */
function nightPreset(area: AreaDef): LightPreset {
  const { night } = LIGHTING;
  return { ...night, fog: { ...night.fog, far: area.nightFog ?? night.fog.far } };
}

/** Night to sunrise over `DAWN.seconds` (the moon sets, the sun rises, every frame), the birds swelling in with it over the water's lapping; `each` runs every unpaused frame too. */
export async function dawn(d: Dawning, each: (dt: number) => void): Promise<void> {
  const { world, ctx, sounds } = d.sys;
  const birds = sounds.birds ? ctx.audio.loop(sounds.birds, 0) : null;
  const water = ctx.audio.loop(sounds.water, DAWN.water);
  d.beds.push(water);
  if (birds) d.beds.push(birds);
  const { lights } = world;
  const sky = createDawn(lights, nightPreset(d.sys.area), d.lantern);
  await precompileSky(ctx.stage.renderer, world.scene, ctx.stage.camera, lights.physical);
  let t = 0;
  let turned = false;
  const lake = d.sys.area.lake;
  const mom = d.scene?.mom.group.position;
  if (lake && mom) d.scene?.actor.faceTo(mom.x, lake.z - 10); // looks out over the water
  await d.until((dt) => {
    t += dt;
    each(dt);
    if (!turned && t >= DAWN.seconds / 2) {
      turned = true;
      const cam = ctx.stage.camera.position;
      d.scene?.actor.faceTo(cam.x, cam.z); // then back to you
    }
    const k = Math.min(1, t / DAWN.seconds);
    birds?.setVolume(DAWN.volume * k);
    sky.step(k, t);
    return k >= 1;
  });
}

/** Mom walks to the player, stops `SHORE.meet` m short and faces them. */
export async function comeToPlayer(d: Dawning, cancelled: () => boolean): Promise<void> {
  const actor = d.scene?.actor;
  if (!actor || !d.scene) return;
  const cam = d.sys.ctx.stage.camera.position;
  const at = meetPoint(d.scene.mom.group.position, cam);
  d.scene.mom.rest = 'Idle_Neutral'; // up off her knees, and she stands with you
  await walkWithin(d.scene, at);
  if (!cancelled()) actor.faceTo(cam.x, cam.z);
}

/** Seconds the dawn's beds take to fade out before the ride starts its own. */
export const BED_FADE = 0.5;

/**
 * Pure-ish: a per-frame predicate that fades `beds` out over `seconds`, then stops and frees them
 * (and empties the list). True once done.
 */
export function bedFade(beds: Bed[], seconds: number): (dt: number) => boolean {
  const from = beds.map((b) => b.getVolume());
  let t = 0;
  return (dt) => {
    t += dt;
    const k = Math.min(1, t / seconds);
    beds.forEach((b, i) => b.setVolume((from[i] ?? 0) * (1 - k)));
    if (k < 1) return false;
    for (const b of beds) {
      b.stop();
      b.disconnect();
    }
    beds.length = 0;
    return true;
  };
}
