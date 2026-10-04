import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';
import { surfaceMaterial, type SurfaceName } from '../../engine/surfaces';
import { createRailing, type Railing } from './railing';
import { bentPlane, EDGE_X, KERB_WIDTH, OVERRUN, RIVER_X, riverSpan, WATER_Y } from './river';
import { type Bend, BEND, farBankInset, mouthFlare, noBend, rowZs, SHORE } from './shore-shape';

export type BankKind = 'embankment' | 'natural';

/** One point of a bank's cross-section: x across the river, y height, colour. */
export interface ProfilePoint {
  x: number;
  y: number;
  color: number;
}

/** Tuning knobs (metres, colours). */
export const BED_Y = -2.2;
export const BANK = {
  kerb: 0x6b6a66,
  wall: 0x45433f,
  rail: 0x1c1c1e,
  mud: 0x3a3226,
  sand: 0x2c2820,
  railX: 2.95, // flush with the wall: the player stops at x 2.7, the rail never clips the view
  postHeight: 0.9,
  postSpacing: 2.5,
} as const;
/** Where the walkable ground must end, so it never overlaps the kerb (x). */
export const groundEndX = (kind: BankKind): number =>
  kind === 'embankment' ? EDGE_X - KERB_WIDTH : EDGE_X;

/** Pure: the near bank's cross-section, from the ground edge down to the riverbed. */
export function bankProfile(kind: BankKind, grass: number = BANK.mud): readonly ProfilePoint[] {
  if (kind === 'embankment') {
    return [
      { x: EDGE_X - KERB_WIDTH, y: 0, color: BANK.kerb },
      { x: EDGE_X, y: 0, color: BANK.kerb },
      { x: EDGE_X, y: 0, color: BANK.wall },
      { x: EDGE_X, y: BED_Y, color: BANK.wall },
    ];
  }
  return [
    { x: 3.0, y: 0, color: grass },
    { x: 3.12, y: -0.45, color: BANK.mud },
    { x: 3.32, y: -0.9, color: BANK.mud },
    { x: 3.6, y: -1.15, color: BANK.sand },
    { x: 8, y: BED_Y, color: BANK.sand },
  ];
}

/** Pure: x where the near bank meets the water (the embankment wall: EDGE_X). */
export function waterlineX(kind: BankKind): number {
  if (kind === 'embankment') return EDGE_X;
  const pts = bankProfile(kind);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.y >= WATER_Y && b.y < WATER_Y) return a.x + ((a.y - WATER_Y) / (a.y - b.y)) * (b.x - a.x);
  }
  return pts[0].x;
}

/** Pure: the bank's height at x (near side), linear between profile points. */
export function bankY(kind: BankKind, x: number): number {
  const pts = bankProfile(kind);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (x >= a.x && x <= b.x && b.x > a.x) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return x < pts[0].x ? pts[0].y : (pts.at(-1)?.y ?? 0);
}

const mirrorX = (x: number): number => 2 * RIVER_X - x;

/** How a bank strip follows the river: `bend` shifts it sideways, `inset` pushes its water line in. */
interface Wander {
  bend: Bend;
  /** Metres the bank's water line has moved toward the river's middle at z (the far bank only). */
  inset?: (z: number) => number;
}

/** Rows of a strip are this tall (m) where it wanders; `BEND.step` where it only bends. */
const WANDER_ROW_STEP = 4;

/**
 * A strip along z (z0 near > z1 far) swept from the profile; flat-shaded per segment. Each row's
 * profile is shifted by the wander: a far bank that pushes in gets a level lip out to its water
 * line (points past the first move; the first stays on the grass).
 */
export function stripGeometry(
  pts: readonly ProfilePoint[],
  zs: readonly number[],
  mirror: boolean,
  { bend, inset }: Wander,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const blend: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const side = mirror ? -1 : 1;
  // A level lip: the first point again, which the inset slides out from.
  const profile = inset ? [pts[0], ...pts] : pts;
  const slide = inset ? 1 : Infinity;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0 && i !== slide) continue;
    const nx = len === 0 ? 0 : (-(b.y - a.y) / len) * side;
    const ny = len === 0 ? 1 : (b.x - a.x) / len;
    const base = pos.length / 3;
    for (let r = 0; r < zs.length; r++) {
      const z = zs[r];
      const shift = bend(z);
      const push = inset ? inset(z) : 0;
      for (const [p, j] of [
        [a, i - 1],
        [b, i],
      ] as const) {
        const x = p.x + (j >= slide ? push : 0);
        pos.push((mirror ? mirrorX(x) : x) + shift, p.y, z);
        nor.push(nx, ny, 0);
        c.setHex(p.color);
        col.push(c.r, c.g, c.b);
        blend.push(p === pts[0] ? 1 : 0); // the top edge fades into the land's own surface
      }
      if (r > 0) {
        const q = base + 2 * r;
        idx.push(q - 2, q - 1, q + 1, q - 2, q + 1, q);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('blend', new THREE.Float32BufferAttribute(blend, 1));
  g.setIndex(idx);
  return g;
}

/** Dark iron railing at `x`: posts every postSpacing m and two rails, merged into one geometry. */
function railGeometry(x: number, z0: number, z1: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let z = z0; z >= z1; z -= BANK.postSpacing) {
    parts.push(
      new THREE.BoxGeometry(0.08, BANK.postHeight, 0.08).translate(x, BANK.postHeight / 2, z),
    );
  }
  const length = z0 - z1;
  for (const y of [BANK.postHeight / 2, BANK.postHeight]) {
    parts.push(new THREE.BoxGeometry(0.05, 0.05, length).translate(x, y, (z0 + z1) / 2));
  }
  return mergeGeometries(parts);
}

/** Pure: what's under x on the near side, land or water (the orca lies on it when it beaches). */
export function groundAt(kind: BankKind, x: number): number {
  return Math.max(bankY(kind, x), WATER_Y);
}

/** Rows at the river mouth, where the banks flare, are this tall (m). */
const MOUTH_ROW_STEP = 1;

/**
 * Both banks and the riverbed over the river's span (see `riverSpan`); the grass colours tint
 * the bank tops so they melt into the land. `endOverrun` is 0 where a lake takes over, and then
 * `lakeZ` (its shore line) rounds the river mouth: both banks flare out into the shore.
 * `land` is the ground's surface (the natural bank's top blends into it). Returns the near railing
 * (embankments only), which the orca can break.
 */
export function addBanks(
  scene: THREE.Scene,
  kind: BankKind,
  [fromZ, toZ]: readonly [number, number],
  [nearGrass, farGrass]: readonly [number, number],
  endOverrun = OVERRUN,
  bend: Bend = noBend,
  lakeZ?: number,
  land: SurfaceName = 'grass',
): Railing | null {
  const { z0, z1 } = riverSpan(fromZ, toZ, endOverrun);
  const material = surfaceMaterial(
    kind === 'embankment'
      ? { base: 'pavement', vertexColors: true }
      : { base: 'mud', blend: land, vertexColors: true },
  );
  material.side = THREE.DoubleSide;
  const near = bankProfile(kind, nearGrass);
  const far = bankProfile(kind, farGrass);
  const flare = lakeZ === undefined ? 0 : SHORE.mouthRadius;
  const fine = lakeZ === undefined ? undefined : { near: lakeZ + flare, step: MOUTH_ROW_STEP };
  const flared = (z: number): number => (lakeZ === undefined ? 0 : mouthFlare(z, lakeZ));
  // The walkable bank stays straight (gameplay reads its edge); only the far bank wanders, and
  // never an embankment, which is built.
  const wandering = kind === 'natural';
  const nearZs = rowZs(z0, z1, BEND.step, fine);
  const farZs = rowZs(z0, z1, wandering ? WANDER_ROW_STEP : BEND.step, fine);
  scene.add(
    new THREE.Mesh(
      stripGeometry(near, nearZs, false, { bend: (z) => bend(z) - flared(z) }),
      material,
    ),
    new THREE.Mesh(
      stripGeometry(far, farZs, true, {
        bend: (z) => bend(z) + flared(z),
        inset: wandering ? farBankInset : undefined,
      }),
      material,
    ),
  );
  const last = near[near.length - 1].x;
  scene.add(
    bentPlane(
      [mirrorX(last) - last + 2 * flare, z0 - z1],
      BANK.sand,
      'mud',
      [RIVER_X, BED_Y, (z0 + z1) / 2],
      bend,
    ),
  );
  if (kind !== 'embankment') return null;
  // The railing is straight: it stops where the river starts to bend away.
  const rz0 = Math.min(z0, fromZ + BEND.lead);
  const rz1 = Math.max(z1, toZ - BEND.lead);
  const rail = new THREE.MeshLambertMaterial({ color: BANK.rail });
  scene.add(new THREE.Mesh(railGeometry(mirrorX(BANK.railX), rz0, rz1), rail));
  const style = { x: BANK.railX, postHeight: BANK.postHeight, spacing: BANK.postSpacing };
  return createRailing(scene, style, rz0, rz1, rail);
}
