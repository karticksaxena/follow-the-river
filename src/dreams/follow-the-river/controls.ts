import type { PickupDef } from './areas/types';
import { canThrow } from './fish';
import { nearSpot } from './flow';
import { collect, isFull, nearestPickup, promptFor } from './pickups';
import { EDGE_X } from './river';
import type { Events, Run, Systems } from './run';
import { isNight, spend } from './state';
import {
  canFire,
  newSwitcher,
  nextWeapon,
  resetSwitcher,
  startSwitch,
  stepSwitch,
  WEAPON_KEYS,
  type Switcher,
  type Weapon,
} from './weapons';
import type { PlayerSense } from './zombies/horde';

/** How close (m) to the wait spot E asks to wait for dark. */
const WAIT_RADIUS = 2;
const CLICK_VOLUME = 0.5;
const KEYS = ['KeyF', 'KeyE', 'Mouse0', ...WEAPON_KEYS] as const;
/** How far (m) a viewmodel sinks while a weapon is swapped. */
const LOWER = 0.5;

type Target = 'pickup' | 'fish' | 'wait' | null;

export interface Controls {
  /** Handles F, E, click and weapon keys for this frame, then works out what E would do next. */
  update(dt: number): void;
  /** Back to the bow unless the checkpoint has the gun. */
  reset(): void;
  /** The weapon in hand. */
  weapon(): Weapon;
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
  sw: Switcher;
  /** Resting heights of the two viewmodels. */
  bowY: number;
  gunY: number;
}

const click = (c: Ctl): void => void c.sys.ctx.audio.once(c.sys.sounds.click, CLICK_VOLUME);

function toggleLight(c: Ctl): void {
  if (c.run.live.supplies.battery <= 0) return;
  c.sys.flashlight.on = !c.sys.flashlight.on;
  click(c);
}

function shootGun(c: Ctl): void {
  if (!c.sys.gun.ready) return;
  const left = spend(c.run.live.supplies, 'ammo', 1);
  if (!left) {
    c.sys.ctx.audio.once(c.sys.sounds.dryFire, CLICK_VOLUME);
    return;
  }
  if (!c.sys.gun.fire(c.sense.eye, c.sense.look, c.sys.horde, c.sys.grid)) return;
  c.run.live.supplies = left;
}

function shoot(c: Ctl): void {
  if (!canFire(c.sw)) return;
  if (c.sw.current === 'gun') {
    shootGun(c);
    return;
  }
  if (!c.sys.bow.ready) return;
  const left = spend(c.run.live.supplies, 'arrows', 1);
  if (!left) {
    click(c); // the HUD shows 0 arrows
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
  else if (found.kind === 'gun') c.events.hint('gun');
  else if (found.kind === 'tape') c.events.tape(found);
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
  // The wait spot is tested first so the prompt doesn't flip at the campfire, by the water.
  else if (!night && nearSpot(x, z, c.sys.area.waitSpot, WAIT_RADIUS)) c.target = 'wait';
  else if (!night && canThrow(x, EDGE_X, c.run.live.supplies.fishPacks)) c.target = 'fish';
  else c.target = null;
}

function use(c: Ctl): void {
  if (c.target === 'pickup' && c.pickup) take(c, c.pickup);
  else if (c.target === 'fish') throwPack(c);
  else if (c.target === 'wait') c.events.wait();
}

/** Weapon keys start a switch; the tween lowers the old model, swaps, raises the new one. */
function switchWeapons(c: Ctl, dt: number): void {
  const { keys } = c.sys.ctx;
  for (const key of WEAPON_KEYS) {
    if (keys.consumePress(key)) startSwitch(c.sw, nextWeapon(c.sw.current, c.run.live.hasGun, key));
  }
  const drop = stepSwitch(c.sw, dt) * LOWER;
  const gun = c.sw.current === 'gun' && c.run.live.hasGun;
  c.sys.bow.view.visible = !gun;
  c.sys.gun.view.visible = gun;
  c.sys.bow.view.position.y = c.bowY - drop;
  c.sys.gun.view.position.y = c.gunY - drop;
}

function tick(c: Ctl, dt: number): void {
  const { keys } = c.sys.ctx;
  switchWeapons(c, dt);
  if (keys.consumePress('KeyF')) toggleLight(c);
  if (keys.consumePress('Mouse0')) shoot(c);
  find(c);
  if (keys.consumePress('KeyE')) {
    use(c);
    find(c);
  }
}

function promptOf(c: Ctl): string | null {
  const dry = c.sw.current === 'gun' && c.run.live.supplies.ammo <= 0 && canFire(c.sw);
  if (dry && c.sys.ctx.keys.isDown('Mouse0')) return 'No bullets';
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
    sw: newSwitcher(),
    bowY: sys.bow.view.position.y,
    gunY: sys.gun.view.position.y,
  };
  return {
    update: (dt) => tick(c, dt),
    reset() {
      if (!run.live.hasGun) resetSwitcher(c.sw);
    },
    drain() {
      for (const code of KEYS) sys.ctx.keys.consumePress(code);
    },
    prompt: () => promptOf(c),
    weapon: () => c.sw.current,
  };
}
