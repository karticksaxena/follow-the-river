import { color, sin, smoothstep, time, uv, vec4 } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { mergeParts } from '../../engine/batch';
import { outdoors } from '../../engine/interiors';
import { loadModel } from '../../engine/models';
import type { PickupDef, PickupKind } from './areas/types';
import { KIT_SCALE, kitUrl, propUrl } from './kits';
import {
  addSupply,
  AMMO_OF,
  scaled,
  SUPPLY_LIMITS,
  type GunKind,
  type RunState,
  type Supplies,
  type SupplyKind,
} from './state';

/** How close (m) you must stand to pick something up. */
export const PICKUP_RADIUS = 1.4;

export const PICKUP_GAIN: Readonly<
  Record<PickupKind, { kind: SupplyKind; amount: number } | null>
> = {
  // A spare battery: R puts it in the torch.
  battery: { kind: 'cells', amount: 1 },
  arrows: { kind: 'arrows', amount: 2 },
  fishPack: { kind: 'fishPacks', amount: 1 },
  // A box (see AMMO_BOX) feeds every gun; this stands for it in the "full" check.
  ammo: { kind: 'ammo', amount: 3 },
  // The pistol itself (taking it adds it to `guns`); it comes loaded with a few bullets.
  gun: { kind: 'ammo', amount: 6 },
  tape: null,
  crate: null, // see CRATE
};

/** What a night crate holds besides its gun: ammo for every gun you own, and the rest. Tuning knobs. */
export const CRATE = {
  ammo: { pistol: 6, shotgun: 4, rifle: 15 } as Readonly<Record<GunKind, number>>,
  arrows: 2,
  cells: 0,
  fishPacks: 1,
};

/** The 'ammo' pickup: this much for every gun you own (pistol bullets if none). */
export const AMMO_BOX: Readonly<Record<GunKind, number>> = { pistol: 3, shotgun: 2, rifle: 8 };

const GUN_NAME: Readonly<Record<GunKind, string>> = {
  pistol: 'the police pistol',
  shotgun: 'the shotgun',
  rifle: 'the rifle',
};

export const PROMPT: Readonly<Record<PickupKind, { take: string; full: string }>> = {
  battery: { take: 'E: pick up batteries', full: 'Batteries full' },
  arrows: { take: 'E: pick up arrows', full: 'Arrows full' },
  fishPack: { take: 'E: pick up a fish pack', full: 'Fish packs full' },
  ammo: { take: 'E: pick up ammo', full: 'Ammo full' },
  gun: { take: 'E: take the gun', full: 'Ammo full' },
  tape: { take: 'E: take the tape', full: '' },
  crate: { take: 'E: open the crate', full: '' },
};

export function nearestPickup(
  x: number,
  z: number,
  list: readonly PickupDef[],
  taken: ReadonlySet<string>,
): PickupDef | null {
  let best: PickupDef | null = null;
  let bestSq = PICKUP_RADIUS * PICKUP_RADIUS;
  for (const p of list) {
    if (taken.has(p.id)) continue;
    const sq = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (sq <= bestSq) {
      best = p;
      bestSq = sq;
    }
  }
  return best;
}

/** The gun a pickup hands you: the Day 2 pistol, or a crate's. */
export function gunIn(pickup: PickupDef): GunKind | null {
  if (pickup.kind === 'gun') return 'pistol';
  return pickup.kind === 'crate' ? (pickup.gun ?? null) : null;
}

/** A crate: its gun, then ammo for every gun you now own, arrows, a spare battery, a fish pack. */
function openCrate(supplies: Supplies, guns: readonly GunKind[], k: number): Supplies {
  let out = supplies;
  for (const gun of guns) out = addSupply(out, AMMO_OF[gun], scaled(CRATE.ammo[gun], k));
  out = addSupply(out, 'arrows', scaled(CRATE.arrows, k));
  out = addSupply(out, 'cells', scaled(CRATE.cells, k));
  return addSupply(out, 'fishPacks', scaled(CRATE.fishPacks, k));
}

/** An ammo box: bullets for every gun you own, or pistol bullets when you have none. */
function openBox(supplies: Supplies, guns: readonly GunKind[], k: number): Supplies {
  let out = supplies;
  for (const gun of guns.length > 0 ? guns : (['pistol'] as const)) {
    out = addSupply(out, AMMO_OF[gun], scaled(AMMO_BOX[gun], k));
  }
  return out;
}

/** New run state with the pickup's supplies (times the difficulty's factor `k`) added (capped) and the pickup marked taken. */
export function collect(state: RunState, pickup: PickupDef, k: number): RunState {
  const gain = PICKUP_GAIN[pickup.kind];
  const found = gunIn(pickup);
  const guns = found && !state.guns.includes(found) ? [...state.guns, found] : state.guns;
  let supplies = state.supplies;
  if (pickup.kind === 'ammo') supplies = openBox(supplies, guns, k);
  else if (gain) supplies = addSupply(supplies, gain.kind, scaled(gain.amount, k));
  if (pickup.kind === 'crate') supplies = openCrate(supplies, guns, k);
  return {
    ...state,
    supplies,
    guns,
    taken: [...state.taken, pickup.id],
    tapes:
      pickup.kind === 'tape' && pickup.tape !== undefined
        ? [...state.tapes, pickup.tape]
        : state.tapes,
  };
}

/** True when taking this pickup would add nothing because that supply is at its limit (guns and crates always count). */
export function isFull(pickup: PickupDef, supplies: Supplies, guns: readonly GunKind[]): boolean {
  if (pickup.kind === 'ammo') {
    const owned = guns.length > 0 ? guns : (['pistol'] as const);
    return owned.every((g) => supplies[AMMO_OF[g]] >= SUPPLY_LIMITS[AMMO_OF[g]]);
  }
  const gain = PICKUP_GAIN[pickup.kind];
  return pickup.kind !== 'gun' && gain !== null && supplies[gain.kind] >= SUPPLY_LIMITS[gain.kind];
}

export function promptFor(pickup: PickupDef, supplies: Supplies, guns: readonly GunKind[]): string {
  if (pickup.kind === 'crate' && pickup.gun) return `E: take ${GUN_NAME[pickup.gun]}`;
  const text = PROMPT[pickup.kind];
  return isFull(pickup, supplies, guns) ? text.full : text.take;
}

export interface PickupMeshes {
  place(list: readonly PickupDef[], taken: ReadonlySet<string>): void;
  remove(id: string): void;
  /** Spin and bob; only pickups within SHOW_RANGE of `eye` are drawn. */
  update(dt: number, eye: { x: number; z: number }): void;
  dispose(): void;
}

// Ammo reuses the arrows model. The crate is the survival kit's chest, sat on the ground.
const MODEL: Readonly<Record<PickupKind, string>> = {
  battery: propUrl('battery'),
  arrows: propUrl('arrows'),
  fishPack: propUrl('fishpack'),
  tape: propUrl('tape'),
  ammo: propUrl('arrows'),
  gun: propUrl('pistol'),
  crate: kitUrl('survival', 'chest'),
};
const GROUNDED: ReadonlySet<PickupKind> = new Set(['crate']);
const HOVER = 0.5;
const BOB = 0.04;
const BOB_SPEED = 2;
const SPIN_SPEED = 0.8;
/** A faint warm halo behind every hovering pickup, so it reads at night from 10 to 20 m (never neon). Tuning knobs. */
export const GLOW = { color: 0xffc27a, size: 1.3, strength: 0.32, pulse: 0.12, speed: 2.2 };

/** One shared halo material: a soft round falloff that breathes slowly and is off inside dark interiors. */
function glowMaterial(): THREE.SpriteNodeMaterial {
  const soft = smoothstep(0, 0.5, uv().sub(0.5).length()).oneMinus();
  const breathe = sin(time.mul(GLOW.speed)).mul(GLOW.pulse).add(1);
  const alpha = soft.mul(soft).mul(GLOW.strength).mul(breathe).mul(outdoors());
  const material = new THREE.SpriteNodeMaterial({ colorNode: vec4(color(GLOW.color), alpha) });
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false; // the fog would hide it from exactly the distance it is for
  return material;
}

/** Pickups further than this (m) are not drawn: the night fog hides them anyway, and each one is
 * several draws (Night 1's houses doubled their count). Tuning knob. */
export const SHOW_RANGE = 40;

interface PickupState {
  readonly templates: ReadonlyMap<string, THREE.Object3D>;
  readonly group: THREE.Group;
  readonly halo: THREE.Sprite;
  readonly meshes: Map<string, THREE.Object3D>;
  // Mirrors of meshes' values, so update() walks arrays without allocating an iterator.
  active: THREE.Object3D[];
  all: THREE.Object3D[];
  time: number;
}

async function loadTemplates(): Promise<Map<string, THREE.Object3D>> {
  const templates = new Map<string, THREE.Object3D>();
  await Promise.all(
    [...new Set(Object.values(MODEL))].map(async (url) =>
      templates.set(url, noShadows(mergeParts(await loadModel(url)))),
    ),
  );
  return templates;
}

/** Small things: their shadows cost a draw per shadow pass and are never seen. */
function noShadows(root: THREE.Object3D): THREE.Object3D {
  root.traverse((n) => (n.castShadow = false));
  return root;
}

/** The meshes that hover and spin (not the grounded crates). */
const spinning = (meshes: ReadonlyMap<string, THREE.Object3D>): THREE.Object3D[] =>
  [...meshes.values()].filter((m) => m.userData.grounded !== true);

function removePickup(s: PickupState, id: string): void {
  const mesh = s.meshes.get(id);
  if (!mesh) return;
  mesh.removeFromParent();
  s.meshes.delete(id);
  s.active = spinning(s.meshes);
  s.all = [...s.meshes.values()];
}

function placePickups(
  s: PickupState,
  list: readonly PickupDef[],
  taken: ReadonlySet<string>,
): void {
  for (const mesh of s.meshes.values()) mesh.removeFromParent();
  s.meshes.clear();
  for (const p of list) {
    const template = s.templates.get(MODEL[p.kind]);
    if (taken.has(p.id) || !template) continue;
    const mesh = template.clone(true);
    if (GROUNDED.has(p.kind)) {
      // Crates sit still on the ground (only the small things hover and spin).
      mesh.scale.setScalar(KIT_SCALE.survival * 0.35);
      mesh.position.set(p.x, 0, p.z);
      mesh.userData.grounded = true;
    } else {
      mesh.position.set(p.x, HOVER, p.z);
      mesh.add(s.halo.clone()); // shares the one material and geometry
    }
    s.group.add(mesh);
    s.meshes.set(p.id, mesh);
  }
  s.active = spinning(s.meshes);
  s.all = [...s.meshes.values()];
}

/** Pure: is a pickup at (x, z) close enough to `eye` to draw? */
export const inShowRange = (x: number, z: number, eye: { x: number; z: number }): boolean =>
  (x - eye.x) ** 2 + (z - eye.z) ** 2 < SHOW_RANGE * SHOW_RANGE;

function updatePickups(s: PickupState, dt: number, eye: { x: number; z: number }): void {
  for (let i = 0; i < s.all.length; i++) {
    const mesh = s.all[i];
    if (mesh) mesh.visible = inShowRange(mesh.position.x, mesh.position.z, eye);
  }
  s.time += dt;
  const y = HOVER + Math.sin(s.time * BOB_SPEED) * BOB;
  for (let i = 0; i < s.active.length; i++) {
    const mesh = s.active[i];
    if (!mesh) continue;
    mesh.position.y = y;
    mesh.rotation.y += SPIN_SPEED * dt;
  }
}

function haloSprite(): THREE.Sprite {
  const sprite = new THREE.Sprite(glowMaterial());
  sprite.scale.setScalar(GLOW.size);
  sprite.castShadow = false;
  return sprite;
}

export async function createPickupMeshes(scene: THREE.Scene): Promise<PickupMeshes> {
  const group = new THREE.Group();
  const s: PickupState = {
    templates: await loadTemplates(),
    halo: haloSprite(),
    group,
    meshes: new Map(),
    active: [],
    all: [],
    time: 0,
  };
  scene.add(group);
  return {
    place: (list, taken) => placePickups(s, list, taken),
    remove: (id) => removePickup(s, id),
    update: (dt, eye) => updatePickups(s, dt, eye),
    dispose() {
      group.removeFromParent();
      s.halo.material.dispose();
      s.meshes.clear();
      s.active = [];
      s.all = [];
    },
  };
}
