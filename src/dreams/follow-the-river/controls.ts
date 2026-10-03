import type { PickupDef } from './areas/types';
import { canThrow } from './fish';
import { nearSpot } from './flow';
import { collect, isFull, nearestPickup, promptFor } from './pickups';
import { EDGE_X } from './river';
import type { Events, Run, Systems } from './run';
import { isNight, spend } from './state';
import type { PlayerSense } from './zombies/horde';

/** How close (m) to the wait spot, and how long (s) a "No arrows" notice stays up. */
const WAIT_RADIUS = 2;
const NOTICE_SECONDS = 1.4;
const CLICK_VOLUME = 0.5;
const KEYS = ['KeyF', 'KeyE', 'Mouse0'] as const;

type Target = 'pickup' | 'fish' | 'wait' | null;

export interface Controls {
  /** Handles F, E and click for this frame, then works out what E would do next. */
  update(dt: number): void;
  /** Drops key presses made while paused so they don't fire on resume. */
  drain(): void;
  /** The prompt for what E would do, or null. */
  prompt(): string | null;
}

export function createControls(
  sys: Systems,
  run: Run,
  events: Events,
  sense: PlayerSense,
): Controls {
  const { ctx, area, bow, fish, flashlight, pickups } = sys;
  const camera = ctx.stage.camera;
  let target: Target = null;
  let pickup: PickupDef | null = null;
  let notice: string | null = null;
  let noticeLeft = 0;
  const click = (): void => void ctx.audio.once(sys.sounds.click, CLICK_VOLUME);

  function toggleLight(): void {
    if (run.live.supplies.battery <= 0) return;
    flashlight.on = !flashlight.on;
    click();
  }

  function shoot(): void {
    if (!bow.ready) return;
    const left = spend(run.live.supplies, 'arrows', 1);
    if (!left) {
      click();
      notice = 'No arrows';
      noticeLeft = NOTICE_SECONDS;
      return;
    }
    run.live.supplies = left;
    bow.fire(sense.eye, sense.look);
  }

  function take(found: PickupDef): void {
    if (isFull(found, run.live.supplies)) return;
    run.live = collect(run.live, found);
    run.taken.add(found.id);
    pickups.remove(found.id);
    click();
    if (found.kind === 'arrows') events.hint('bow');
    else if (found.kind === 'fishPack') events.hint('fish');
  }

  function throwPack(): void {
    const left = spend(run.live.supplies, 'fishPacks', 1);
    if (!left) return;
    run.live.supplies = left;
    run.live.fed++;
    fish.feed(sense.eye);
  }

  function find(): void {
    const night = isNight(run.phase);
    pickup = night
      ? null
      : nearestPickup(camera.position.x, camera.position.z, area.pickups, run.taken);
    if (pickup) target = 'pickup';
    else if (!night && canThrow(camera.position.x, EDGE_X, run.live.supplies.fishPacks))
      target = 'fish';
    else if (!night && nearSpot(camera.position.x, camera.position.z, area.waitSpot, WAIT_RADIUS))
      target = 'wait';
    else target = null;
  }

  function use(): void {
    if (target === 'pickup' && pickup) take(pickup);
    else if (target === 'fish') throwPack();
    else if (target === 'wait') events.wait();
  }

  const drain = (): void => {
    for (const code of KEYS) ctx.keys.consumePress(code);
  };

  return {
    drain,
    update(dt) {
      noticeLeft -= dt;
      if (noticeLeft <= 0) notice = null;
      if (ctx.keys.consumePress('KeyF')) toggleLight();
      if (ctx.keys.consumePress('Mouse0')) shoot();
      find();
      if (ctx.keys.consumePress('KeyE')) {
        use();
        find();
      }
    },
    prompt() {
      if (notice) return notice;
      if (target === 'pickup' && pickup) return promptFor(pickup, run.live.supplies);
      if (target === 'fish') return 'E: throw a fish pack';
      return target === 'wait' ? 'E: wait for dark' : null;
    },
  };
}
