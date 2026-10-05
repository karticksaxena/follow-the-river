import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';

/** Wall things, room-local metres. `along` runs along the wall (z on the side walls, x on the north wall). */
export interface WallThing {
  kind: 'frame' | 'clock';
  wall: 'west' | 'east' | 'north';
  along: number;
  /** Height of the centre above the floor. */
  y: number;
  w: number;
  h: number;
}

/** Two pictures on the side walls (not behind the TV) and a clock above the bookcases. */
export const WALL_THINGS: readonly WallThing[] = [
  { kind: 'frame', wall: 'west', along: -0.9, y: 1.55, w: 0.9, h: 0.65 },
  { kind: 'frame', wall: 'east', along: 0.5, y: 1.55, w: 0.65, h: 0.85 },
  { kind: 'clock', wall: 'north', along: 2.0, y: 2.15, w: 0.44, h: 0.44 },
];

/** Shelf board tops of a bookcaseOpen at x2 (m above the floor) and the clear height above each. */
export const SHELF_Y = [0.26, 0.74, 1.22] as const;
const SHELF_CLEAR = 0.44;
/** The shelf's inside width and depth at x2. */
const SHELF_W = 0.6;
const SHELF_D = 0.4;

const SPINES = [0x5a1f1c, 0x1d2a47, 0x4a4a22, 0x4b3320, 0x8a7a5a, 0x2e3b2c];
const FRAME = 0x1a130e;
const LANDSCAPE = [0x232c3a, 0x28301f] as const; // sky, field: both muted and dark
const PORTRAIT = [0x3a302a, 0x1f1b19] as const; // a vague pale-dark figure on a darker ground
const CLOCK = { face: 0x6e6657, rim: 0x1a130e, hands: 0x15110d, radius: 0.22 } as const;

/** Deterministic noise, so the shelves look the same on every start. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A box painted one colour (a per-vertex colour, so everything merges into one draw). */
function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(
  [w, h, d]: [number, number, number],
  [x, y, z]: [number, number, number],
  hex: number,
  rotZ = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0); // base at y 0
  g.rotateZ(rotZ);
  return paint(g.translate(x, y, z), hex);
}

/** One shelf: 4-7 books, some gaps, the last one leaning or two lying flat. */
function shelf(
  rand: () => number,
  cx: number,
  cz: number,
  y: number,
  out: THREE.BufferGeometry[],
): void {
  const count = 4 + Math.floor(rand() * 4);
  let x = cx - SHELF_W / 2 + rand() * 0.08;
  for (let i = 0; i < count; i++) {
    const w = 0.035 + rand() * 0.03;
    const h = 0.2 + rand() * (SHELF_CLEAR - 0.22);
    const d = 0.2 + rand() * (SHELF_D - 0.22);
    const hex = SPINES[Math.floor(rand() * SPINES.length)];
    const last = i === count - 1;
    const lean = last && rand() < 0.6 ? 0.28 : 0;
    out.push(box([w, h, d], [x + w / 2, y, cz], hex, lean ? -lean : 0));
    x += w + (rand() < 0.25 ? 0.05 + rand() * 0.08 : 0.004);
    if (x > cx + SHELF_W / 2 - 0.1) break;
  }
  if (rand() < 0.5 && x < cx + SHELF_W / 2 - 0.2) {
    const flat = [0.2 + rand() * 0.04, 0.03, 0.2] as [number, number, number];
    out.push(box(flat, [x + 0.13, y, cz], SPINES[Math.floor(rand() * SPINES.length)]));
  }
}

function frame(t: WallThing, out: THREE.BufferGeometry[]): void {
  const [sky, ground] = t.w > t.h ? LANDSCAPE : PORTRAIT;
  const inset = 0.06;
  const parts: THREE.BufferGeometry[] = [
    paint(new THREE.BoxGeometry(t.w, t.h, 0.04), FRAME),
    paint(
      new THREE.PlaneGeometry(t.w - inset * 2, (t.h - inset * 2) / 2).translate(
        0,
        (t.h - inset * 2) / 4,
        0.021,
      ),
      sky,
    ),
    paint(
      new THREE.PlaneGeometry(t.w - inset * 2, (t.h - inset * 2) / 2).translate(
        0,
        -(t.h - inset * 2) / 4,
        0.021,
      ),
      ground,
    ),
  ];
  out.push(...parts.map((g) => place(g, t)));
}

const disc = (radius: number, depth: number, z: number, hex: number): THREE.BufferGeometry =>
  paint(
    new THREE.CylinderGeometry(radius, radius, depth, 24).rotateX(Math.PI / 2).translate(0, 0, z),
    hex,
  );
const hand = (len: number, angle: number): THREE.BufferGeometry =>
  paint(
    new THREE.BoxGeometry(0.018, len, 0.01).translate(0, len / 2, 0.03).rotateZ(angle),
    CLOCK.hands,
  );

function clock(t: WallThing, out: THREE.BufferGeometry[]): void {
  const r = CLOCK.radius;
  out.push(
    ...[
      disc(r, 0.04, 0, CLOCK.rim),
      disc(r * 0.88, 0.04, 0.005, CLOCK.face),
      hand(r * 0.6, -0.3),
      hand(r * 0.8, -1.9),
    ].map((g) => place(g, t)),
  );
}

/** Moves wall-local geometry (front toward +z, centred) onto its wall. */
function place(g: THREE.BufferGeometry, t: WallThing): THREE.BufferGeometry {
  const depth = 0.025;
  if (t.wall === 'north') return g.translate(t.along, t.y, -2.5 + depth);
  if (t.wall === 'west') return g.rotateY(Math.PI / 2).translate(-3.5 + depth, t.y, t.along);
  return g.rotateY(-Math.PI / 2).translate(3.5 - depth, t.y, t.along);
}

/** All the books, pictures and the clock as one mesh (one draw), in world space (room at `dx`). */
export function buildDecor(bookcases: readonly { x: number; z: number }[], dx: number): THREE.Mesh {
  const rand = rng(7);
  const parts: THREE.BufferGeometry[] = [];
  for (const b of bookcases) for (const y of SHELF_Y) shelf(rand, b.x, b.z, y, parts);
  for (const t of WALL_THINGS) (t.kind === 'frame' ? frame : clock)(t, parts);
  const geometries = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geometries) g.deleteAttribute('uv');
  const merged = mergeGeometries(geometries, false);
  merged.translate(dx, 0, 0);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const mesh = new THREE.Mesh(merged, material);
  mesh.receiveShadow = true;
  return mesh;
}
