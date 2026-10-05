import * as THREE from 'three/webgpu';
import { assetUrl } from '../../engine/assets';
import { addBatched } from '../../engine/batch';
import type { Box } from '../../engine/collide';
import { loadModel } from '../../engine/models';
import { buildDecor } from './intro-decor';

/** Kenney furniture is modelled small; x2 matches the home bedroom (a sofa ~2 m, a bookcase ~1.8 m). */
const SCALE = 2;
/** The room's inside, room-local metres (walls sit outside these). */
export const ROOM_INSIDE = { minX: -3.5, maxX: 3.5, minZ: -2.5, maxZ: 2.5 } as const;

/** Kenney models are unscaled [width, depth, height] metres; the origin is a corner, so we centre them. */
const SIZE = {
  rugRectangle: [1.57, 0.92, 0.01],
  tableCoffee: [0.66, 0.4, 0.23],
  sideTable: [0.53, 0.22, 0.38],
  bookcaseOpen: [0.4, 0.25, 0.88],
  pottedPlant: [0.22, 0.24, 0.65],
  loungeChair: [0.49, 0.41, 0.46],
  books: [0.15, 0.09, 0.1],
  lampRoundTable: [0.16, 0.18, 0.31],
} as const;
type Kind = keyof typeof SIZE;

export interface Piece {
  kind: Kind;
  /** Centre on the floor plan (room-local x, z). */
  x: number;
  z: number;
  /** Turn about Y; the model's front faces +z at 0. */
  rot: number;
  /** Height of the surface it stands on (m): 0 = the floor. */
  y: number;
  /** Solid for the player and Mom. */
  solid: boolean;
}

const piece = (kind: Kind, x: number, z: number, rot = 0, y = 0, solid = false): Piece => ({
  kind,
  x,
  z,
  rot,
  y,
  solid,
});
const top = (kind: 'tableCoffee' | 'sideTable'): number => SIZE[kind][2] * SCALE;

/** A worn family living room: the sofa (intro-scene) faces the TV across a rug and a coffee table. */
export const FURNITURE: readonly Piece[] = [
  piece('rugRectangle', 0, -0.45),
  piece('tableCoffee', 0, -0.45, 0, 0, true),
  piece('books', 0.25, -0.4, 0.4, top('tableCoffee')),
  piece('sideTable', 1.3, 1.2, Math.PI / 2, 0, true),
  piece('lampRoundTable', 1.3, 1.2, 0, top('sideTable')),
  piece('bookcaseOpen', 1.6, -2.25, Math.PI, 0, true),
  piece('bookcaseOpen', 2.4, -2.25, Math.PI, 0, true),
  piece('loungeChair', -2.85, -0.9, Math.PI / 2, 0, true),
  piece('pottedPlant', -3.1, -2.1, 0, 0, true),
];

/** The one warm lamp light (the dusk fill stays); sits at the shade of the lamp on the side table. Tuning knobs. */
export const LAMP_LIGHT = { color: 0xffb36b, intensity: 2.5, distance: 6, y: 1.4 } as const;

/** The footprint of a piece, as an axis-aligned box (room-local). */
export function footprint(p: Piece): Box {
  const [w, d] = SIZE[p.kind];
  const c = Math.abs(Math.cos(p.rot));
  const s = Math.abs(Math.sin(p.rot));
  const hx = ((w * c + d * s) * SCALE) / 2;
  const hz = ((w * s + d * c) * SCALE) / 2;
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz };
}

/** Colliders for the big pieces, shifted by `dx` (the room's world x). */
export function furnitureColliders(dx: number): Box[] {
  return FURNITURE.filter((p) => p.solid).map((p) => {
    const b = footprint(p);
    return { minX: b.minX + dx, maxX: b.maxX + dx, minZ: b.minZ, maxZ: b.maxZ };
  });
}

/** Kenney's wood is pale and glows at dusk: worn walnut at about half the albedo. Fabrics are muted. Tuning knobs. */
const WOOD_TINT = 0x7a5f48;
const FABRIC = { saturation: 0.7, value: 0.8 } as const;
const WOODS = new Set(['wood', 'woodDark']);
const FABRICS = new Set(['carpet', 'carpetDarker']);

/** Gives the piece its own tinted copies of the wood and fabric materials (the cached ones are shared with the bedroom). */
function tint(root: THREE.Object3D): void {
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
    const m: unknown = node.material;
    if (!(m instanceof THREE.MeshStandardMaterial)) return;
    const wood = WOODS.has(m.name);
    if (!wood && !FABRICS.has(m.name)) return;
    const copy = m.clone();
    delete copy.userData.cached;
    if (wood) copy.color.multiply(new THREE.Color(WOOD_TINT));
    else {
      copy.color.getHSL(hsl);
      copy.color.setHSL(hsl.h, hsl.s * FABRIC.saturation, hsl.l * FABRIC.value);
    }
    node.material = copy;
  });
}

async function loadPiece(p: Piece, dx: number): Promise<THREE.Object3D> {
  const model = await loadModel(assetUrl(`home/${p.kind}.glb`));
  const holder = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model);
  tint(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z); // centred on the footprint, base at y 0
  holder.add(model);
  holder.scale.setScalar(SCALE);
  holder.rotation.y = p.rot;
  holder.position.set(p.x + dx, p.y, p.z);
  return holder;
}

/** Adds the furniture (merged per material, so a handful of draws) and the lamp light to `scene`. */
export async function furnishRoom(scene: THREE.Scene, dx: number): Promise<void> {
  const pieces = await Promise.all(FURNITURE.map((p) => loadPiece(p, dx)));
  addBatched(scene, pieces);
  scene.add(
    buildDecor(
      FURNITURE.filter((p) => p.kind === 'bookcaseOpen'),
      dx,
    ),
  );
  const lamp = FURNITURE.find((p) => p.kind === 'lampRoundTable');
  if (!lamp) return;
  const light = new THREE.PointLight(
    LAMP_LIGHT.color,
    LAMP_LIGHT.intensity,
    LAMP_LIGHT.distance,
    2,
  );
  light.position.set(lamp.x + dx, LAMP_LIGHT.y, lamp.z);
  scene.add(light);
}
