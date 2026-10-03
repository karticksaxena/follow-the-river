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

/** What the control functions share. */
interface Ctl {
  sys: Systems;
  run: Run;
  events: Events;
  sense: PlayerSense;
  target: Target;
  pickup: PickupDef | null;
  notice: string | null;
  noticeLeft: number;
}

const click = (c: Ctl): void => void c.sys.ctx.audio.once(c.sys.sounds.click, CLICK_VOLUME);

function toggleLight(c: Ctl): void {
  if (c.run.live.supplies.battery <= 0) return;
  c.sys.flashlight.on = !c.sys.flashlight.on;
  click(c);
}

function shoot(c: Ctl): void {
  if (!c.sys.bow.ready) return;
  const left = spend(c.run.live.supplies, 'arrows', 1);
  if (!left) {
    click(c);
    c.notice = 'No arrows';
    c.noticeLeft = NOTICE_SECONDS;
    return;
  }
  c.run.live.supplies = left;
  c.sys.bow.fire(c.sense.eye, c.sense.look);
}

function take(c: Ctl, found: PickupDef): void {
  if (isFull(found, c.run.live.supplies)) return;
  c.run.live = collect(c.run.live, found);
  c.run.taken.add(found.id);
  c.sys.pickups.remove(found.id);
  click(c);
  if (found.kind === 'arrows') c.events.hint('bow');
  else if (found.kind === 'fishPack') c.events.hint('fish');
}

function throwPack(c: Ctl): void {
  const left = spend(c.run.live.supplies, 'fishPacks', 1);
  if (!left) return;
  c.run.live.supplies = left;
  c.run.live.fed++;
  c.sys.fish.feed(c.sense.eye);
}

/** Works out what E would do from where the player stands. */
function find(c: Ctl): void {
  const { x, z } = c.sys.ctx.stage.camera.position;
  const night = isNight(c.run.phase);
  c.pickup = night ? null : nearestPickup(x, z, c.sys.area.pickups, c.run.taken);
  if (c.pickup) c.target = 'pickup';
  else if (!night && canThrow(x, EDGE_X, c.run.live.supplies.fishPacks)) c.target = 'fish';
  else if (!night && nearSpot(x, z, c.sys.area.waitSpot, WAIT_RADIUS)) c.target = 'wait';
  else c.target = null;
}

function use(c: Ctl): void {
  if (c.target === 'pickup' && c.pickup) take(c, c.pickup);
  else if (c.target === 'fish') throwPack(c);
  else if (c.target === 'wait') c.events.wait();
}

function tick(c: Ctl, dt: number): void {
  const { keys } = c.sys.ctx;
  c.noticeLeft -= dt;
  if (c.noticeLeft <= 0) c.notice = null;
  if (keys.consumePress('KeyF')) toggleLight(c);
  if (keys.consumePress('Mouse0')) shoot(c);
  find(c);
  if (keys.consumePress('KeyE')) {
    use(c);
    find(c);
  }
}

function promptOf(c: Ctl): string | null {
  if (c.notice) return c.notice;
  if (c.target === 'pickup' && c.pickup) return promptFor(c.pickup, c.run.live.supplies);
  if (c.target === 'fish') return 'E: throw a fish pack';
  return c.target === 'wait' ? 'E: wait for dark' : null;
}

export function createControls(
  sys: Systems,
  run: Run,
  events: Events,
  sense: PlayerSense,
): Controls {
  const c: Ctl = {
    sys,
    run,
    events,
    sense,
    target: null,
    pickup: null,
    notice: null,
    noticeLeft: 0,
  };
  return {
    update: (dt) => tick(c, dt),
    drain() {
      for (const code of KEYS) sys.ctx.keys.consumePress(code);
    },
    prompt: () => promptOf(c),
  };
}
