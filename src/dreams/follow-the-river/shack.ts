import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { loadModel } from '../../engine/models';
import type { ShackDef } from './areas/types';
import { KIT_SCALE, kitUrl } from './kits';

/** One survival-kit wall tile in metres (0.54 native × scale ≈ 3.24 m). */
export const SHACK_TILE = 0.54 * KIT_SCALE.survival;
/** Native wall height 0.5 × scale. */
const WALL_HEIGHT = 0.5 * KIT_SCALE.survival;
const COLLIDER_THICKNESS = 0.2;
/** Wall pieces are ~0.54 m thick; colliders sit in the middle of that. */
const WALL_INSET = 0.27;
const DOOR_GAP = 1.4;
const ROOF_THICKNESS = 0.25;
const ROOF_COLOR = 0x2a2724;
const FLOOR_COLOR = 0x1c1a18;

/** Door tile index along z (the middle tile; the upper middle for even widths). */
function doorTile(def: ShackDef): number {
  return Math.floor(def.width / 2);
}

function doorZ(def: ShackDef): number {
  return def.z + (doorTile(def) + 0.5 - def.width / 2) * SHACK_TILE;
}

/** Footprint (for "am I inside?" checks). Depth runs along x, width along z. */
export function shackBounds(def: ShackDef): Box {
  return boxAt(def.x, def.z, def.depth * SHACK_TILE, def.width * SHACK_TILE);
}

function wall(minX: number, maxX: number, minZ: number, maxZ: number): Box {
  return { minX, maxX, minZ, maxZ };
}

/** Wall colliders, leaving a doorway (the middle tile of the +X side) open. */
export function shackColliders(def: ShackDef): Box[] {
  const b = shackBounds(def);
  const t = COLLIDER_THICKNESS / 2;
  const inner = {
    minX: b.minX + WALL_INSET,
    maxX: b.maxX - WALL_INSET,
    minZ: b.minZ + WALL_INSET,
    maxZ: b.maxZ - WALL_INSET,
  };
  const gap = DOOR_GAP / 2;
  const door = doorZ(def);
  return [
    wall(inner.minX - t, inner.minX + t, b.minZ, b.maxZ),
    wall(b.minX, b.maxX, inner.minZ - t, inner.minZ + t),
    wall(b.minX, b.maxX, inner.maxZ - t, inner.maxZ + t),
    wall(inner.maxX - t, inner.maxX + t, b.minZ, door - gap),
    wall(inner.maxX - t, inner.maxX + t, door + gap, b.maxZ),
  ];
}

/**
 * Survival-kit walls pivot at the tile's centre with the wall on its -Z edge (measured from the
 * GLB accessors), so rotating a piece about its tile centre keeps it on that edge.
 * Yaw per side: -Z 0, +Z π, +X -π/2, -X π/2.
 */
async function wallPiece(
  model: string,
  x: number,
  z: number,
  yaw: number,
): Promise<THREE.Object3D> {
  const piece = await loadModel(kitUrl('survival', model));
  piece.scale.setScalar(KIT_SCALE.survival);
  piece.position.set(x, 0, z);
  piece.rotation.y = yaw;
  return piece;
}

interface WallSlot {
  x: number;
  z: number;
  yaw: number;
  door: boolean;
}

function wallSlots(def: ShackDef): WallSlot[] {
  const b = shackBounds(def);
  const slots: WallSlot[] = [];
  const cx = (i: number): number => b.minX + (i + 0.5) * SHACK_TILE;
  const cz = (j: number): number => b.minZ + (j + 0.5) * SHACK_TILE;
  for (let j = 0; j < def.width; j++) {
    slots.push({ x: b.minX + SHACK_TILE / 2, z: cz(j), yaw: Math.PI / 2, door: false });
    slots.push({
      x: b.maxX - SHACK_TILE / 2,
      z: cz(j),
      yaw: -Math.PI / 2,
      door: j === doorTile(def),
    });
  }
  for (let i = 0; i < def.depth; i++) {
    slots.push({ x: cx(i), z: b.minZ + SHACK_TILE / 2, yaw: 0, door: false });
    slots.push({ x: cx(i), z: b.maxZ - SHACK_TILE / 2, yaw: Math.PI, door: false });
  }
  return slots;
}

/**
 * Walls and doorway are survival-kit pieces; the roof and floor are plain boxes because the kit's
 * roof/floor pieces are 3 m-tall props (native 0.5 high), not flat slabs.
 */
export async function addShack(scene: THREE.Scene, def: ShackDef): Promise<void> {
  const slots = wallSlots(def);
  const pieces = await Promise.all(
    slots.map((s) =>
      wallPiece(s.door ? 'structure-metal-doorway' : 'structure-metal-wall', s.x, s.z, s.yaw),
    ),
  );
  const b = shackBounds(def);
  const size = { x: b.maxX - b.minX, z: b.maxZ - b.minZ };
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, ROOF_THICKNESS, size.z),
    new THREE.MeshLambertMaterial({ color: ROOF_COLOR }),
  );
  roof.position.set(def.x, WALL_HEIGHT + ROOF_THICKNESS / 2, def.z);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x, size.z),
    new THREE.MeshLambertMaterial({ color: FLOOR_COLOR }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(def.x, 0.02, def.z);
  scene.add(...pieces, roof, floor);
}
