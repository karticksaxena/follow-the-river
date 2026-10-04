import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';
import type { PropPlacement } from './areas/types';
import { EDGE_X, KERB_WIDTH, OVERRUN, RIVER_X, riverSpan } from './river';
import { seeded } from './skyline';

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
  wall: 0x2f2e2c,
  rail: 0x1c1c1e,
  mud: 0x3a3226,
  sand: 0x2c2820,
  railX: 2.95, // flush with the wall: the player stops at x 2.7, the rail never clips the view
  postHeight: 0.9,
  postSpacing: 2.5,
  reedStep: [3, 5],
  reedX: [5.6, 6.4],
  reedScale: 0.5,
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
    { x: 4.2, y: -0.35, color: BANK.mud },
    { x: 6.0, y: -0.85, color: BANK.mud },
    { x: 7.0, y: -1.05, color: BANK.sand },
    { x: 10, y: BED_Y, color: BANK.sand },
  ];
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

/** A strip along z (z0 near > z1 far) swept from the profile; flat-shaded per segment. */
function stripGeometry(
  pts: readonly ProfilePoint[],
  z0: number,
  z1: number,
  mirror: boolean,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const side = mirror ? -1 : 1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const nx = (-(b.y - a.y) / len) * side;
    const ny = (b.x - a.x) / len;
    const base = pos.length / 3;
    for (const [p, z] of [
      [a, z0],
      [b, z0],
      [b, z1],
      [a, z1],
    ] as const) {
      pos.push(mirror ? mirrorX(p.x) : p.x, p.y, z);
      nor.push(nx, ny, 0);
      c.setHex(p.color);
      col.push(c.r, c.g, c.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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

/**
 * Both banks and the riverbed over the river's span (see `riverSpan`); the grass colours tint
 * the bank tops so they melt into the land. `endOverrun` is 0 where a lake takes over.
 */
export function addBanks(
  scene: THREE.Scene,
  kind: BankKind,
  [fromZ, toZ]: readonly [number, number],
  [nearGrass, farGrass]: readonly [number, number],
  endOverrun = OVERRUN,
): void {
  const { z0, z1 } = riverSpan(fromZ, toZ, endOverrun);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const near = bankProfile(kind, nearGrass);
  const far = bankProfile(kind, farGrass);
  scene.add(
    new THREE.Mesh(stripGeometry(near, z0, z1, false), material),
    new THREE.Mesh(stripGeometry(far, z0, z1, true), material),
  );
  const last = near[near.length - 1].x;
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(mirrorX(last) - last, z0 - z1),
    new THREE.MeshLambertMaterial({ color: BANK.sand }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(RIVER_X, BED_Y, (z0 + z1) / 2);
  scene.add(bed);
  if (kind !== 'embankment') return;
  const rail = new THREE.MeshLambertMaterial({ color: BANK.rail });
  scene.add(
    new THREE.Mesh(railGeometry(BANK.railX, z0, z1), rail),
    new THREE.Mesh(railGeometry(mirrorX(BANK.railX), z0, z1), rail),
  );
}

/** Reeds and grass clumps just above the waterline on both banks, every 3-5 m (seeded). */
export function reedPlacements(fromZ: number, toZ: number): PropPlacement[] {
  const random = seeded(3);
  const out: PropPlacement[] = [];
  const [s0, s1] = BANK.reedStep;
  const [x0, x1] = BANK.reedX;
  for (let side = 0; side < 2; side++) {
    for (let z = fromZ; z >= toZ; z -= s0 + random() * (s1 - s0)) {
      const x = x0 + random() * (x1 - x0);
      out.push({
        kit: 'nature',
        // Dry wheat-like stalks read as reeds; the kit's grass is a bright teal that glowed under the torch.
        model: 'crops_wheatStageB',
        x: side ? mirrorX(x) : x,
        y: bankY('natural', x),
        z,
        yaw: random() * Math.PI * 2,
        scale: BANK.reedScale,
      });
    }
  }
  return out;
}
