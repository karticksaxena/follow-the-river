import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { loadModel } from '../../engine/models';
import type { AreaDef, GatePiece, PickupDef, WaveDef } from './areas/types';
import { KIT_SCALE, kitUrl } from './kits';
import { EDGE_X } from './river';

/**
 * A night is fought in waves (Kartik, Plan 6): walking past a wave's start brings its zombies in
 * groups, a barricade downstream holds you until the last one is dead, then it falls. Tuning knobs.
 */
export const WAVE = {
  /** Zombies per group, and seconds between groups. */
  group: 3,
  gap: 2.2,
  /** Spawn distance from the player (m): far enough to come out of the fog, not pop up. */
  near: 16,
  far: 28,
  /** Share of groups that come from downstream (between you and the barricade). */
  ahead: 0.6,
  /** How long a barricade takes to fall (s). */
  fallSeconds: 0.7,
} as const;

/** Where a wave is: waiting for you, or fighting with `toSpawn` still to come. */
export interface WaveState {
  /** Waves cleared so far; the one in play (or next) is `cleared`. */
  cleared: number;
  fighting: boolean;
  toSpawn: number;
  timer: number;
}

export type WaveEvent =
  | { kind: 'start'; wave: number }
  | { kind: 'spawn'; count: number }
  | { kind: 'clear'; wave: number }
  | null;

export const newWaveState = (cleared = 0): WaveState => ({
  cleared,
  fighting: false,
  toSpawn: 0,
  timer: 0,
});

/** Pure: one frame of the waves. `z` is the player's, `alive` the zombies left on the bank. */
export function stepWaves(
  w: WaveState,
  waves: readonly WaveDef[],
  z: number,
  alive: number,
  dt: number,
): WaveEvent {
  const def = waves[w.cleared];
  if (!def) return null;
  if (!w.fighting) {
    if (z > def.z) return null;
    w.fighting = true;
    w.toSpawn = def.count;
    w.timer = 0;
    return { kind: 'start', wave: w.cleared };
  }
  w.timer -= dt;
  if (w.toSpawn > 0 && w.timer <= 0) {
    const count = Math.min(WAVE.group, w.toSpawn);
    w.toSpawn -= count;
    w.timer = WAVE.gap;
    return { kind: 'spawn', count };
  }
  if (w.toSpawn > 0 || alive > 0) return null;
  w.fighting = false;
  w.cleared++;
  return { kind: 'clear', wave: w.cleared - 1 };
}

/** Wave `i`'s zombies left (still to come plus alive), or 0 when it isn't being fought. */
export const waveLeft = (w: WaveState, alive: number): number =>
  w.fighting ? w.toSpawn + alive : 0;

/** Pure: a spawn spot for a wave zombie, on the bank within [minX, maxX], never past the gate. */
export function waveSpawn(
  player: { x: number; z: number },
  gateZ: number,
  minX: number,
  maxX: number,
  random: () => number,
): { x: number; z: number } {
  const d = WAVE.near + random() * (WAVE.far - WAVE.near);
  const x = minX + random() * (maxX - minX);
  const ahead = player.z - d;
  const room = ahead > gateZ + 2;
  const z = random() < WAVE.ahead && room ? ahead : player.z + d;
  return { x, z };
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
