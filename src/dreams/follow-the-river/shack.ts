import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import type { Interior } from '../../engine/interiors';
import type { ShackDef } from './areas/types';
import { KIT_SCALE } from './kits';

/** One survival-kit wall tile in metres (0.54 native × scale ≈ 3.24 m). */
export const SHACK_TILE = 0.54 * KIT_SCALE.survival;
/** Wall height in metres. */
const WALL_HEIGHT = 3;
/** Doorway height; the lintel fills the rest. */
export const DOOR_HEIGHT = 2.1;
const COLLIDER_THICKNESS = 0.2;
/** Colliders (and wall slabs) sit this far inside the footprint edge. */
const WALL_INSET = 0.27;
const DOOR_GAP = 1.4;
const ROOF_THICKNESS = 0.25;
const ROOF_OVERHANG = 0.3;
/** Roof tilt about z (radians): rises toward -X so rain runs off the door side. */
const ROOF_SLOPE = 0.05;
const WALL_COLOR = 0x6a625a;
const STRIPE_COLOR = '#4a443e';
/** Corrugation stripes are ~10 cm wide: the 64 px texture (8 px per stripe) covers 0.8 m. */
const TEXTURE_METRES = 0.8;
const FLOOR_COLOR = 0x2c2a26;
// Standard (not Lambert) so the shacks receive scene.environment light like everything else.
const SHACK_ROUGHNESS = 0.75;
const SHACK_METALNESS = 0.15;
const FLOOR_ROUGHNESS = 0.95;

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

/** What the lighting needs: the footprint, the wall height and the doorway point on the +X wall. */
export function shackInterior(def: ShackDef): Interior {
  const b = shackBounds(def);
  return { ...b, top: WALL_HEIGHT + ROOF_THICKNESS, doorX: b.maxX, doorZ: doorZ(def) };
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

let metal: THREE.MeshStandardMaterial | null = null;

/** One shared dark rusty corrugated-metal material, built on first use. */
function metalMaterial(): THREE.MeshStandardMaterial {
  if (metal) return metal;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${WALL_COLOR.toString(16)}`;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = STRIPE_COLOR;
    for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 2, 64);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  metal = new THREE.MeshStandardMaterial({
    map,
    roughness: SHACK_ROUGHNESS,
    metalness: SHACK_METALNESS,
  });
  return metal;
}

/** A slab covering `box` between heights y0 and y1; UVs are in metres so stripes stay ~10 cm. */
function slab(box: Box, y0: number, y1: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(box.maxX - box.minX, y1 - y0, box.maxZ - box.minZ);
  geometry.translate((box.minX + box.maxX) / 2, (y0 + y1) / 2, (box.minZ + box.maxZ) / 2);
  return metersToUv(geometry);
}

function metersToUv(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    uv.setXY(
      i,
      (position.getX(i) + position.getZ(i)) / TEXTURE_METRES,
      position.getY(i) / TEXTURE_METRES,
    );
  }
  return geometry;
}

function solid(geometries: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Solid corrugated-metal walls (the same slabs as the colliders, with a lintel over the door),
 * a slightly sloped overhanging roof and a dark floor. One walls mesh, one roof mesh per shack.
 * (The Kenney metal wall pieces are open scaffolding, so they are not used.)
 */
export function addShack(scene: THREE.Scene, def: ShackDef): Promise<void> {
  const material = metalMaterial();
  const colliders = shackColliders(def);
  const walls = colliders.map((box) => slab(box, 0, WALL_HEIGHT));
  const door = colliders[3];
  const above = { ...door, minZ: door.maxZ, maxZ: colliders[4].minZ };
  walls.push(slab(above, DOOR_HEIGHT, WALL_HEIGHT));
  const b = shackBounds(def);
  const roofGeometry = new THREE.BoxGeometry(
    b.maxX - b.minX + 2 * ROOF_OVERHANG,
    ROOF_THICKNESS,
    b.maxZ - b.minZ + 2 * ROOF_OVERHANG,
  );
  roofGeometry.rotateZ(ROOF_SLOPE);
  roofGeometry.translate(def.x, WALL_HEIGHT + ROOF_THICKNESS / 2, def.z);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ),
    new THREE.MeshStandardMaterial({
      color: FLOOR_COLOR,
      roughness: FLOOR_ROUGHNESS,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(def.x, 0.02, def.z);
  floor.receiveShadow = true;
  scene.add(solid(walls, material), solid([metersToUv(roofGeometry)], material), floor);
  return Promise.resolve();
}
