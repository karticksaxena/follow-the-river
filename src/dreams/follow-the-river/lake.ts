import * as THREE from 'three/webgpu';
import { surfaceMaterial, type SurfaceName } from '../../engine/surfaces';
import {
  EDGE_X,
  FAR_EDGE_X,
  LAKE,
  lakeRects,
  PEBBLE_COLOR,
  type Rect,
  shoreY,
  WATER_Y,
} from './river';
import { lakeDepth, type LakeFrame, mouthFlare } from './shore-shape';
import { createWaterMesh, LAKE_FLOW, setWaterAttribute } from './water';

/** Shore terrain grid cell (m). A 4 m slope takes about one and a half cells. Tuning knob. */
const CELL = 3;
/**
 * Pure: 0 pebbles .. 1 land at `depth` m inside the lake outline. It reaches 1 at the shore mesh's
 * own edge (`LAKE.pebbleDepth` on land), where the grass ground plane begins: a smaller value
 * there left a dead straight seam. The surface shader breaks this ramp up with noise (`ragged`).
 */
export function beachBlend(depth: number): number {
  const t = (-depth - LAKE.slopeStart) / (LAKE.pebbleDepth - LAKE.slopeStart);
  return Math.min(1, Math.max(0, t));
}

/** The shore's height where the outline is `depth` m inside the lake (negative: on land). */
export function shoreHeight(depth: number): number {
  return shoreY(Math.max(-depth, -LAKE.slopeRun));
}

/** A height field over `r` that follows the lake outline: pebbles at the water, land beyond. */
function shoreMesh(r: Rect, frame: LakeFrame, landColor: number, land: SurfaceName): THREE.Mesh {
  // The side by the river: its edge follows the banks' flare, so the mouth is rounded.
  const west = r.x1 === EDGE_X;
  const inner = west ? r.x1 : r.x0;
  const width = r.x1 - r.x0;
  const depth = r.z0 - r.z1;
  const geo = new THREE.PlaneGeometry(
    width,
    depth,
    Math.ceil(width / CELL),
    Math.ceil(depth / CELL),
  );
  geo.rotateX(-Math.PI / 2);
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const blend = new Float32Array(p.count);
  const pebble = new THREE.Color(PEBBLE_COLOR);
  const landTint = new THREE.Color(landColor);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) + cz;
    // Squeeze each row's columns toward the flared edge (heights below are computed in place).
    const flare = mouthFlare(z, frame.z) * (west ? -1 : 1);
    const outer = west ? r.x0 : r.x1;
    const x = outer + ((p.getX(i) + cx - outer) * (inner + flare - outer)) / (inner - outer);
    p.setX(i, x - cx);
    const d = lakeDepth(x, z, frame);
    p.setY(i, shoreHeight(d));
    blend[i] = beachBlend(d);
    c.copy(pebble).lerp(landTint, blend[i]);
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    surfaceMaterial({ base: 'pebbles', blend: land, vertexColors: true, ragged: true }),
  );
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Pure: metres from (x, z) to the nearest waterline: the lake outline's depth, or inside the
 * river mouth the distance to its flared banks (the mouth itself is open water, not a shore).
 */
export function waterlineDistance(x: number, z: number, frame: LakeFrame): number {
  const flare = mouthFlare(z, frame.z);
  const banks = Math.min(x - (EDGE_X - flare), FAR_EDGE_X + flare - x);
  return Math.max(lakeDepth(x, z, frame), banks);
}

/**
 * The lake: still dark water in one rectangle, and shore terrain either side of the river mouth
 * whose outline wanders (coves, points, rounded corners, a far shore), so no straight water edge
 * is ever in view. Built once.
 */
export function addLake(
  scene: THREE.Scene,
  z: number,
  landColor: number,
  bankColor: number,
  land: SurfaceName,
): void {
  const r = lakeRects(z);
  const frame: LakeFrame = { z, west: LAKE.west, east: LAKE.east };
  const water = createWaterMesh(
    r.water.x1 - r.water.x0,
    r.water.z0 - r.water.z1,
    LAKE_FLOW,
    'forest',
  );
  const cx = (r.water.x0 + r.water.x1) / 2;
  const cz = (r.water.z0 + r.water.z1) / 2;
  // A grid, so each vertex can carry its distance to the wandering shore (the foam's band).
  water.geometry.dispose();
  water.geometry = new THREE.PlaneGeometry(
    r.water.x1 - r.water.x0,
    r.water.z0 - r.water.z1,
    Math.ceil((r.water.x1 - r.water.x0) / CELL),
    Math.ceil((r.water.z0 - r.water.z1) / CELL),
  );
  setWaterAttribute(water.geometry, (x, y) => waterlineDistance(x + cx, cz - y, frame), cx);
  water.position.set(cx, WATER_Y, cz);
  scene.add(
    water,
    shoreMesh(r.shoreWest, frame, landColor, land),
    shoreMesh(r.shoreEast, frame, bankColor, land),
  );
}
