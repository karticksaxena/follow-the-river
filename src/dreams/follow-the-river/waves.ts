import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { loadModel } from '../../engine/models';
import type { AmbushDef, AreaDef, GatePiece, PickupDef, WaveDef } from './areas/types';
import type { DifficultyTuning } from './difficulty';
import { KIT_SCALE, kitUrl } from './kits';
import { EDGE_X } from './river';

/**
 * A night is fought in waves (Kartik, Plan 6), each a string of ambushes set off along the zone
 * (Plan 7): walking past an ambush's trigger springs it, a barricade downstream holds you until the
 * last zombie of the wave is dead, then it falls. Tuning knobs.
 */
export const WAVE = {
  /** Spawn distance ahead of / behind the player (m): out of the fog, never in your face. */
  near: 16,
  far: 28,
  /** Cover and lying ambushes scatter this wide around their spot (m). */
  spread: 3,
  /** How long a barricade takes to fall (s). */
  fallSeconds: 0.7,
} as const;

/** Where a wave is: waiting for you, or fighting with `toSpawn` zombies of untriggered ambushes. */
export interface WaveState {
  /** Waves cleared so far; the one in play (or next) is `cleared`. */
  cleared: number;
  fighting: boolean;
  /** Ambushes of the wave in play already sprung. */
  fired: number;
  /** Zombies of the wave in play still to spawn (ambushes not yet sprung included). */
  toSpawn: number;
  /** Seconds to the next continuous spawn. */
  nextIn: number;
}

export type WaveEvent =
  | { kind: 'start'; wave: number }
  | { kind: 'spawn'; ambush: AmbushDef }
  | { kind: 'one' }
  | { kind: 'clear'; wave: number }
  | null;

export const newWaveState = (cleared = 0): WaveState => ({
  cleared,
  fighting: false,
  fired: 0,
  toSpawn: 0,
  nextIn: 0,
});

/** Zombies in a wave's ambushes. */
export const waveTotal = (def: WaveDef): number => def.ambushes.reduce((n, a) => n + a.count, 0);

/** Zombies a wave sends at difficulty factor `k`: never fewer than its ambushes. */
export const quotaOf = (def: WaveDef, k: number): number =>
  Math.max(waveTotal(def), Math.round(def.quota * k));

const reservedFrom = (def: WaveDef, fired: number): number =>
  def.ambushes.slice(fired).reduce((n, a) => n + a.count, 0);

const ONE: WaveEvent = { kind: 'one' };

/**
 * Pure: one frame of the waves. `z` is the player's, `alive` the zombies (lying too) on the bank.
 * Once started a wave sends a zombie every few seconds (up to its cap) until its quota is out,
 * so standing still never buys peace; ambushes are extra bursts at their triggers.
 */
export function stepWaves(
  w: WaveState,
  waves: readonly WaveDef[],
  z: number,
  alive: number,
  dt: number,
  d: Pick<DifficultyTuning, 'quota' | 'interval'>,
  rand: () => number,
): WaveEvent {
  const def = waves[w.cleared];
  if (!def) return null;
  if (!w.fighting) {
    if (z > def.z) return null;
    w.fighting = true;
    w.fired = 0;
    w.toSpawn = quotaOf(def, d.quota);
    w.nextIn = 0;
    return { kind: 'start', wave: w.cleared };
  }
  const next = def.ambushes[w.fired];
  if (next && z <= next.z) {
    w.fired++;
    w.toSpawn -= next.count;
    return { kind: 'spawn', ambush: next };
  }
  w.nextIn -= dt;
  if (w.toSpawn > reservedFrom(def, w.fired) && alive < def.cap && w.nextIn <= 0) {
    w.toSpawn--;
    const [lo, hi] = def.every;
    w.nextIn = (lo + rand() * (hi - lo)) * d.interval;
    return ONE;
  }
  if (w.toSpawn > 0 || alive > 0) return null;
  w.fighting = false;
  w.cleared++;
  return { kind: 'clear', wave: w.cleared - 1 };
}

/** Where continuous spawns go (tuning knobs): out of the fog, never in your face. */
export const SPAWN = {
  near: 18,
  far: 32,
  flank: 4,
  keepAway: 12,
  land: 14,
  behindMax: 10,
} as const;

/** A z `keepAway` from the player for a spawn `dx` across: on the side asked, else the other. */
function pushedZ(pz: number, dx: number, sign: number, lo: number, hi: number): number {
  const dz = Math.sqrt(Math.max(0, SPAWN.keepAway ** 2 - dx * dx));
  const a = pz + sign * dz;
  if (a >= lo && a <= hi) return a;
  const b = pz - sign * dz;
  return b >= lo && b <= hi ? b : Math.max(lo, Math.min(hi, a));
}

/**
 * Pure: where one continuous zombie appears. 45 % ahead (downstream), 25 % behind, 30 % from the
 * land side; always on the bank, short of the gate, and at least `keepAway` from the player.
 */
export function spawnSpot(
  player: { x: number; z: number },
  zone: { startZ: number; gateZ: number; minX: number; maxX: number },
  rand: () => number,
): { x: number; z: number } {
  const roll = rand();
  const d = SPAWN.near + rand() * (SPAWN.far - SPAWN.near);
  const lo = zone.gateZ + 2;
  const hi = zone.startZ + SPAWN.behindMax;
  const land = roll >= 0.7;
  const sign = roll < 0.45 ? -1 : roll < 0.7 ? 1 : rand() < 0.5 ? -1 : 1;
  const span = land ? SPAWN.flank : zone.maxX - zone.minX;
  const x = zone.minX + rand() * span;
  let z = Math.max(lo, Math.min(hi, player.z + sign * (land ? SPAWN.land : d)));
  if (Math.hypot(x - player.x, z - player.z) < SPAWN.keepAway) {
    z = pushedZ(player.z, x - player.x, z >= player.z ? 1 : -1, lo, hi);
  }
  return { x, z };
}

/** Pure: where one zombie of an ambush goes, on the bank within [minX, maxX], never past the gate. */
export function ambushSpot(
  a: AmbushDef,
  player: { x: number; z: number },
  gateZ: number,
  minX: number,
  maxX: number,
  random: () => number,
): { x: number; z: number } {
  const clampX = (x: number): number => Math.max(minX, Math.min(maxX, x));
  const d = WAVE.near + random() * (WAVE.far - WAVE.near);
  const floor = gateZ + 2;
  if (a.kind === 'cover' || a.kind === 'lying') {
    const x = (a.x ?? (minX + maxX) / 2) + (random() - 0.5) * WAVE.spread;
    const z = (a.at ?? player.z - d) + (random() - 0.5) * WAVE.spread;
    return { x: clampX(x), z: Math.max(floor, z) };
  }
  if (a.kind === 'behind') return { x: clampX(minX + random() * (maxX - minX)), z: player.z + d };
  // street: out of a side street on the land side, ahead of you
  return { x: clampX(minX + random() * 3), z: Math.max(floor, player.z - d) };
}

/** The night's crates: one just past each wave's start (their ids are per area and wave). */
export function waveCrates(area: AreaDef): PickupDef[] {
  return area.waves.map((w, i) => ({
    id: `${area.id}-crate-${i + 1}`,
    kind: 'crate' as const,
    x: w.crate.x,
    z: w.z - 2,
    ...(w.crate.gun ? { gun: w.crate.gun } : {}),
  }));
}

/** Small supplies at the water's edge, three per zone: something to run for while the wave comes. */
export function edgePickups(area: AreaDef): PickupDef[] {
  const kinds = ['ammo', 'arrows', 'ammo'] as const;
  return area.waves.flatMap((w, i) =>
    kinds.map((kind, k) => ({
      id: `${area.id}-edge-${i + 1}-${k + 1}`,
      kind,
      x: EDGE_X - 0.45,
      z: w.z - 25 - k * 30,
    })),
  );
}

/** The one line that says what to do; `wave` is the waves cleared (all of them: the lake is next). */
export function objective(o: {
  night: boolean;
  fighting: boolean;
  wave: number;
  waves: number;
  ending: boolean;
  lake: boolean;
}): string {
  if (o.ending) return '';
  if (!o.night) return 'Search for supplies. Rest by the campfire when you are ready.';
  if (o.fighting) return 'Kill them all. The barricade falls when the wave is dead.';
  if (o.lake && o.wave >= o.waves) return 'Follow the river to the lake. Mom is waiting.';
  return 'Follow the river. Keep moving downstream.';
}

export interface Gates {
  /** One collider per barricade; opened ones are moved out of the world (see `open`). */
  readonly boxes: readonly Box[];
  /** The barricade falls (animated by `update`). */
  open(i: number): void;
  /** The first `cleared` barricades already down, the rest standing (a night's start or restart). */
  set(cleared: number): void;
  update(dt: number): void;
}

/** Far outside every strip: a "removed" collider stays in the grids but can never be touched. */
const GONE = 1e5;

// ponytail: an opened barricade's box is moved to GONE instead of being removed, so the player's
// and the horde's grids (both built from the same Box objects) never need rebuilding.
function moveBox(box: Box, to: Box): void {
  box.minX = to.minX;
  box.maxX = to.maxX;
  box.minZ = to.minZ;
  box.maxZ = to.maxZ;
}

/** A piece of a barricade, scaled and turned, and its width across the bank (m). */
async function loadPiece(p: GatePiece): Promise<{ model: THREE.Object3D; width: number }> {
  const model = await loadModel(kitUrl(p.kit, p.model));
  model.scale.setScalar(KIT_SCALE[p.kit] * (p.scale ?? 1));
  model.rotation.y = p.yaw;
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  return { model, width: Math.max(0.3, size.x) };
}

/** One barricade: a solid row across the bank (pieces overlap a little), a few extras in front. */
function buildGate(
  row: { model: THREE.Object3D; width: number },
  extra: { model: THREE.Object3D; width: number },
  fromX: number,
  toX: number,
): THREE.Group {
  const group = new THREE.Group();
  const count = Math.ceil((toX - fromX) / (row.width * 0.9));
  const step = (toX - fromX) / count;
  for (let i = 0; i <= count; i++) {
    const p = row.model.clone(true);
    p.position.set(fromX + i * step, 0, (i % 2) * 0.15);
    p.rotation.y += (i % 3) * 0.05;
    group.add(p);
    if (i % 3 !== 1) continue;
    const e = extra.model.clone(true);
    e.position.set(fromX + i * step + step / 2, 0, 1.1);
    group.add(e);
  }
  return group;
}

/** The barricades, one across the bank at each wave's gate, built from the area's gate pieces. */
export async function createGates(scene: THREE.Scene, area: AreaDef): Promise<Gates> {
  const [row, extra] = await Promise.all([loadPiece(area.gate.row), loadPiece(area.gate.extra)]);
  const width = EDGE_X - area.landX;
  const groups = area.waves.map((w) => {
    const group = buildGate(row, extra, area.landX + 0.5, EDGE_X - 0.3);
    group.position.z = w.gateZ;
    scene.add(group);
    return group;
  });
  const shut = area.waves.map((w) => boxAt(area.landX + width / 2, w.gateZ, width, 1.2));
  const boxes = shut.map((b) => ({ ...b }));
  const falling = area.waves.map(() => -1); // seconds into the fall, or -1 standing
  const pose = (i: number, k: number): void => {
    const g = groups[i];
    if (!g) return;
    g.rotation.x = -(Math.PI / 2) * k * k; // tips over downstream, faster as it goes
    g.position.y = -0.4 * k;
    g.visible = k < 1;
  };
  return {
    boxes,
    open(i) {
      const box = boxes[i];
      if (!box || falling[i] !== -1) return;
      moveBox(box, { minX: GONE, maxX: GONE, minZ: GONE, maxZ: GONE });
      falling[i] = 0;
    },
    set(cleared) {
      for (let i = 0; i < boxes.length; i++) {
        const down = i < cleared;
        const box = boxes[i];
        const to = shut[i];
        if (box && to) moveBox(box, down ? { minX: GONE, maxX: GONE, minZ: GONE, maxZ: GONE } : to);
        falling[i] = down ? WAVE.fallSeconds : -1;
        pose(i, down ? 1 : 0);
      }
    },
    update(dt) {
      for (let i = 0; i < falling.length; i++) {
        const t = falling[i] ?? -1;
        if (t < 0 || t >= WAVE.fallSeconds) continue;
        falling[i] = Math.min(WAVE.fallSeconds, t + dt);
        pose(i, (falling[i] ?? 0) / WAVE.fallSeconds);
      }
    },
  };
}
