import * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';
import type { PickupDef, PickupKind } from './areas/types';
import { propUrl } from './kits';
import { addSupply, SUPPLY_LIMITS, type RunState, type Supplies, type SupplyKind } from './state';

/** How close (m) you must stand to pick something up. */
export const PICKUP_RADIUS = 1.4;

export const PICKUP_GAIN: Readonly<
  Record<PickupKind, { kind: SupplyKind; amount: number } | null>
> = {
  battery: { kind: 'battery', amount: 45 },
  arrows: { kind: 'arrows', amount: 3 },
  fishPack: { kind: 'fishPacks', amount: 1 },
  ammo: { kind: 'ammo', amount: 6 },
  tape: null,
};

const PROMPT: Readonly<Record<PickupKind, { take: string; full: string }>> = {
  battery: { take: 'E: pick up batteries', full: 'Batteries full' },
  arrows: { take: 'E: pick up arrows', full: 'Arrows full' },
  fishPack: { take: 'E: pick up a fish pack', full: 'Fish packs full' },
  ammo: { take: 'E: pick up ammo', full: 'Ammo full' },
  tape: { take: 'E: take the tape', full: '' },
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

/** New run state with the pickup's supplies added (capped) and the pickup marked taken. */
export function collect(state: RunState, pickup: PickupDef): RunState {
  const gain = PICKUP_GAIN[pickup.kind];
  return {
    ...state,
    supplies: gain ? addSupply(state.supplies, gain.kind, gain.amount) : state.supplies,
    taken: [...state.taken, pickup.id],
    tapes:
      pickup.kind === 'tape' && pickup.tape !== undefined
        ? [...state.tapes, pickup.tape]
        : state.tapes,
  };
}

/** True when taking this pickup would add nothing because that supply is at its limit. */
export function isFull(pickup: PickupDef, supplies: Supplies): boolean {
  const gain = PICKUP_GAIN[pickup.kind];
  return gain !== null && supplies[gain.kind] >= SUPPLY_LIMITS[gain.kind];
}

export function promptFor(pickup: PickupDef, supplies: Supplies): string {
  const text = PROMPT[pickup.kind];
  return isFull(pickup, supplies) ? text.full : text.take;
}

export interface PickupMeshes {
  place(list: readonly PickupDef[], taken: ReadonlySet<string>): void;
  remove(id: string): void;
  update(dt: number): void;
  dispose(): void;
}

// Ammo reuses the arrows model until the gun task supplies its own.
const MODEL: Readonly<Record<PickupKind, string>> = {
  battery: 'battery',
  arrows: 'arrows',
  fishPack: 'fishpack',
  tape: 'tape',
  ammo: 'arrows',
};
const HOVER = 0.5;
const BOB = 0.04;
const BOB_SPEED = 2;
const SPIN_SPEED = 0.8;

export async function createPickupMeshes(scene: THREE.Scene): Promise<PickupMeshes> {
  const templates = new Map<string, THREE.Object3D>();
  await Promise.all(
    [...new Set(Object.values(MODEL))].map(async (n) =>
      templates.set(n, await loadModel(propUrl(n))),
    ),
  );

  const group = new THREE.Group();
  scene.add(group);
  const meshes = new Map<string, THREE.Object3D>();
  // Mirror of meshes' values, so update() walks an array without allocating an iterator.
  let active: THREE.Object3D[] = [];
  let time = 0;

  const remove = (id: string): void => {
    const mesh = meshes.get(id);
    if (!mesh) return;
    mesh.removeFromParent();
    meshes.delete(id);
    active = [...meshes.values()];
  };

  return {
    place(list, taken) {
      for (const mesh of meshes.values()) mesh.removeFromParent();
      meshes.clear();
      for (const p of list) {
        const template = templates.get(MODEL[p.kind]);
        if (taken.has(p.id) || !template) continue;
        const mesh = template.clone(true);
        mesh.position.set(p.x, HOVER, p.z);
        group.add(mesh);
        meshes.set(p.id, mesh);
      }
      active = [...meshes.values()];
    },
    remove,
    update(dt) {
      time += dt;
      const y = HOVER + Math.sin(time * BOB_SPEED) * BOB;
      for (let i = 0; i < active.length; i++) {
        const mesh = active[i];
        if (!mesh) continue;
        mesh.position.y = y;
        mesh.rotation.y += SPIN_SPEED * dt;
      }
    },
    dispose() {
      group.removeFromParent();
      meshes.clear();
      active = [];
    },
  };
}
