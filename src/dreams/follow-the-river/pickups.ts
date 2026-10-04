import * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';
import type { PickupDef, PickupKind } from './areas/types';
import { KIT_SCALE, kitUrl, propUrl } from './kits';
import {
  addSupply,
  AMMO_OF,
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
  arrows: { kind: 'arrows', amount: 3 },
  fishPack: { kind: 'fishPacks', amount: 1 },
  ammo: { kind: 'ammo', amount: 6 },
  // The pistol itself (taking it adds it to `guns`); it comes loaded with a few bullets.
  gun: { kind: 'ammo', amount: 8 },
  tape: null,
  crate: null, // see CRATE
};

/** What a night crate holds besides its gun: ammo for every gun you own, and the rest. Tuning knobs. */
export const CRATE = {
  ammo: { pistol: 12, shotgun: 8, rifle: 45 } as Readonly<Record<GunKind, number>>,
  arrows: 4,
  cells: 1,
  fishPacks: 1,
};

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
function openCrate(supplies: Supplies, guns: readonly GunKind[]): Supplies {
  let out = supplies;
  for (const gun of guns) out = addSupply(out, AMMO_OF[gun], CRATE.ammo[gun]);
  out = addSupply(out, 'arrows', CRATE.arrows);
  out = addSupply(out, 'cells', CRATE.cells);
  return addSupply(out, 'fishPacks', CRATE.fishPacks);
}

/** New run state with the pickup's supplies added (capped) and the pickup marked taken. */
export function collect(state: RunState, pickup: PickupDef): RunState {
  const gain = PICKUP_GAIN[pickup.kind];
  const found = gunIn(pickup);
  const guns = found && !state.guns.includes(found) ? [...state.guns, found] : state.guns;
  let supplies = gain ? addSupply(state.supplies, gain.kind, gain.amount) : state.supplies;
  if (pickup.kind === 'crate') supplies = openCrate(supplies, guns);
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
export function isFull(pickup: PickupDef, supplies: Supplies): boolean {
  const gain = PICKUP_GAIN[pickup.kind];
  return pickup.kind !== 'gun' && gain !== null && supplies[gain.kind] >= SUPPLY_LIMITS[gain.kind];
}

export function promptFor(pickup: PickupDef, supplies: Supplies): string {
  if (pickup.kind === 'crate' && pickup.gun) return `E: take ${GUN_NAME[pickup.gun]}`;
  const text = PROMPT[pickup.kind];
  return isFull(pickup, supplies) ? text.full : text.take;
}

export interface PickupMeshes {
  place(list: readonly PickupDef[], taken: ReadonlySet<string>): void;
  remove(id: string): void;
  update(dt: number): void;
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

interface PickupState {
  readonly templates: ReadonlyMap<string, THREE.Object3D>;
  readonly group: THREE.Group;
  readonly meshes: Map<string, THREE.Object3D>;
  // Mirror of meshes' values, so update() walks an array without allocating an iterator.
  active: THREE.Object3D[];
  time: number;
}

async function loadTemplates(): Promise<Map<string, THREE.Object3D>> {
  const templates = new Map<string, THREE.Object3D>();
  await Promise.all(
    [...new Set(Object.values(MODEL))].map(async (url) => templates.set(url, await loadModel(url))),
  );
  return templates;
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
    } else mesh.position.set(p.x, HOVER, p.z);
    s.group.add(mesh);
    s.meshes.set(p.id, mesh);
  }
  s.active = spinning(s.meshes);
}

function updatePickups(s: PickupState, dt: number): void {
  s.time += dt;
  const y = HOVER + Math.sin(s.time * BOB_SPEED) * BOB;
  for (let i = 0; i < s.active.length; i++) {
    const mesh = s.active[i];
    if (!mesh) continue;
    mesh.position.y = y;
    mesh.rotation.y += SPIN_SPEED * dt;
  }
}

export async function createPickupMeshes(scene: THREE.Scene): Promise<PickupMeshes> {
  const group = new THREE.Group();
  const s: PickupState = {
    templates: await loadTemplates(),
    group,
    meshes: new Map(),
    active: [],
    time: 0,
  };
  scene.add(group);
  return {
    place: (list, taken) => placePickups(s, list, taken),
    remove: (id) => removePickup(s, id),
    update: (dt) => updatePickups(s, dt),
    dispose() {
      group.removeFromParent();
      s.meshes.clear();
      s.active = [];
    },
  };
}
