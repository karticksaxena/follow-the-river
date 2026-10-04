import type * as THREE from 'three/webgpu';
import type { PickupDef } from './areas/types';
import { canThrow, FISH, styleFor } from './fish';
import { nearSpot } from './flow';
import type { Gun } from './gun';
import { collect, gunIn, isFull, nearestPickup, promptFor } from './pickups';
import { EDGE_X } from './river';
import type { Events, Run, Systems } from './run';
import { AMMO_OF, isNight, spend, SUPPLY_LIMITS } from './state';
import {
  canFire,
  newSwitcher,
  nextWeapon,
  owns,
  resetSwitcher,
  SLOTS,
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
const KEYS = ['KeyF', 'KeyE', 'KeyR', 'Mouse0', ...WEAPON_KEYS] as const;
/** How far (m) a viewmodel sinks while a weapon is swapped. */
const LOWER = 0.5;

type Target = 'interact' | 'pickup' | 'fish' | 'wait' | null;

export interface Controls {
  /** Handles F, E, R, click and weapon keys for this frame, then works out what E would do next. */
  update(dt: number): void;
  /** Back to the bow unless the checkpoint still has the weapon in hand. */
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
  /** Each weapon's viewmodel and its resting height. */
  views: Record<Weapon, { view: THREE.Object3D; y: number }>;
}

const click = (c: Ctl): void => void c.sys.ctx.audio.once(c.sys.sounds.click, CLICK_VOLUME);

function toggleLight(c: Ctl): void {
  if (c.run.live.supplies.battery <= 0) return;
  c.sys.flashlight.on = !c.sys.flashlight.on;
  click(c);
}

/** R: a fresh battery into the torch (it comes on). */
function newBattery(c: Ctl): void {
  const { supplies } = c.run.live;
  if (supplies.battery >= SUPPLY_LIMITS.battery) return;
  const left = spend(supplies, 'cells', 1);
  if (!left) return;
  c.run.live.supplies = { ...left, battery: SUPPLY_LIMITS.battery };
  c.sys.flashlight.on = true;
  click(c);
}

function gunInHand(c: Ctl): Gun | null {
  const w = c.sw.current;
  return w === 'bow' ? null : c.sys.armory.guns[w];
}

/** `pressed`: this frame's click (an empty rifle clicks once per press, not every frame). */
function shootGun(c: Ctl, gun: Gun, pressed: boolean): void {
  if (!gun.ready) return;
  const left = spend(c.run.live.supplies, AMMO_OF[gun.kind], 1);
  if (!left) {
    if (pressed) c.sys.ctx.audio.once(c.sys.sounds.dryFire, CLICK_VOLUME);
    return;
  }
  if (!gun.fire(c.sense.eye, c.sense.look, c.sys.horde, c.sys.grid)) return;
  c.run.live.supplies = left;
}

function shootBow(c: Ctl): void {
  if (!c.sys.bow.ready) return;
  const left = spend(c.run.live.supplies, 'arrows', 1);
  if (!left) {
    click(c); // the HUD shows 0 arrows
    return;
  }
  c.run.live.supplies = left;
  c.sys.bow.fire(c.sense.eye, c.sense.look);
}

/** A click fires once; the rifle keeps firing while the button is held. */
function trigger(c: Ctl): void {
  const { keys } = c.sys.ctx;
  const gun = gunInHand(c);
  const pressed = keys.consumePress('Mouse0');
  if (!canFire(c.sw)) return;
  if (gun?.spec.auto && keys.isDown('Mouse0')) shootGun(c, gun, pressed);
  else if (pressed && gun) shootGun(c, gun, true);
  else if (pressed) shootBow(c);
}

function take(c: Ctl, found: PickupDef): void {
  if (isFull(found, c.run.live.supplies)) return;
  const gun = gunIn(found);
  const fresh = gun !== null && !c.run.live.guns.includes(gun);
  c.run.live = collect(c.run.live, found);
  c.run.taken.add(found.id);
  c.sys.pickups.remove(found.id);
  click(c);
  if (fresh && gun) startSwitch(c.sw, gun); // a new gun goes straight into your hands
  if (found.kind === 'arrows') c.events.hint('bow');
  else if (found.kind === 'fishPack') c.events.hint('fish');
  else if (found.kind === 'battery') c.events.hint('battery');
  else if (fresh && gun) c.events.hint(gun);
  else if (found.kind === 'tape') c.events.tape(found);
}

/** E at the edge: a pack into the river. At night the orca gets hungrier on the spot. */
function throwPack(c: Ctl): void {
  const left = spend(c.run.live.supplies, 'fishPacks', 1);
  if (!left) return;
  c.run.live.supplies = left;
  c.run.live.fed++;
  c.sys.fish.feed(c.sense.eye);
  if (!isNight(c.run.phase)) return;
  c.sys.fish.arm(c.sys.fish.strikes + FISH.strikesPerPack, styleFor(c.run.live.fed));
}

/** Works out what E would do from where the player stands. */
function find(c: Ctl): void {
  const { x, z } = c.sys.ctx.stage.camera.position;
  const night = isNight(c.run.phase);
  const act = c.run.interact;
  c.pickup = nearestPickup(x, z, c.run.pickups, c.run.taken);
  if (act && Math.hypot(x - act.at.x, z - act.at.z) <= act.radius) c.target = 'interact';
  else if (c.pickup) c.target = 'pickup';
  // The wait spot is tested first so the prompt doesn't flip at the campfire, by the water.
  else if (!night && nearSpot(x, z, c.sys.area.waitSpot, WAIT_RADIUS)) c.target = 'wait';
  else if (canThrow(x, EDGE_X, c.run.live.supplies.fishPacks)) c.target = 'fish';
  else c.target = null;
}

function use(c: Ctl): void {
  if (c.target === 'interact') c.run.interact?.use();
  else if (c.target === 'pickup' && c.pickup) take(c, c.pickup);
  else if (c.target === 'fish') throwPack(c);
  else if (c.target === 'wait') c.events.wait();
}

/** Weapon keys start a switch; the tween lowers the old model, swaps, raises the new one. */
function switchWeapons(c: Ctl, dt: number): void {
  const { keys } = c.sys.ctx;
  const { guns } = c.run.live;
  for (const key of WEAPON_KEYS) {
    if (keys.consumePress(key)) startSwitch(c.sw, nextWeapon(c.sw.current, guns, key), key);
  }
  const drop = stepSwitch(c.sw, dt) * LOWER;
  for (const w of SLOTS) {
    const v = c.views[w];
    v.view.visible = w === c.sw.current && owns(guns, w);
    v.view.position.y = v.y - drop;
  }
}

function tick(c: Ctl, dt: number): void {
  const { keys } = c.sys.ctx;
  switchWeapons(c, dt);
  if (keys.consumePress('KeyF')) toggleLight(c);
  if (keys.consumePress('KeyR')) newBattery(c);
  trigger(c);
  find(c);
  if (keys.consumePress('KeyE')) {
    use(c);
    find(c);
  }
}

function promptOf(c: Ctl): string | null {
  const gun = gunInHand(c);
  const dry = gun !== null && c.run.live.supplies[AMMO_OF[gun.kind]] <= 0 && canFire(c.sw);
  if (dry && c.sys.ctx.keys.isDown('Mouse0')) return 'No ammo';
  if (c.target === 'interact') return c.run.interact?.prompt ?? null;
  if (c.target === 'pickup' && c.pickup) return promptFor(c.pickup, c.run.live.supplies);
  if (c.target === 'fish') return isNight(c.run.phase) ? 'E: feed Dras' : 'E: throw a fish pack';
  return c.target === 'wait' ? 'E: wait for dark' : null;
}

const view = (o: THREE.Object3D): { view: THREE.Object3D; y: number } => ({
  view: o,
  y: o.position.y,
});

export function createControls(
  sys: Systems,
  run: Run,
  events: Events,
  sense: PlayerSense,
): Controls {
  const { guns } = sys.armory;
  const c: Ctl = {
    sys,
    run,
    events,
    sense,
    target: null,
    pickup: null,
    sw: newSwitcher(),
    views: {
      bow: view(sys.bow.view),
      pistol: view(guns.pistol.view),
      shotgun: view(guns.shotgun.view),
      rifle: view(guns.rifle.view),
    },
  };
  return {
    update: (dt) => tick(c, dt),
    reset() {
      if (!owns(run.live.guns, c.sw.current)) resetSwitcher(c.sw);
    },
    drain() {
      for (const code of KEYS) sys.ctx.keys.consumePress(code);
    },
    prompt: () => promptOf(c),
    weapon: () => c.sw.current,
  };
}
