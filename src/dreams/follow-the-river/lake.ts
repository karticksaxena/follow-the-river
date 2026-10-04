import * as THREE from 'three/webgpu';
import { EDGE_X, LAKE, lakeRects, PEBBLE_COLOR, type Rect, shoreY, WATER_Y } from './river';
import { lakeDepth, type LakeFrame, mouthFlare } from './shore-shape';
import { createWaterMesh, LAKE_FLOW } from './water';

/** Shore terrain grid cell (m). A 4 m slope takes about one and a half cells. Tuning knob. */
const CELL = 3;
/** Pebbles fade into the land colour over this many metres, starting where the slope ends. */
const PEBBLE_FADE = 6;

/** The shore's height where the outline is `depth` m inside the lake (negative: on land). */
export function shoreHeight(depth: number): number {
  return shoreY(Math.max(-depth, -LAKE.slopeRun));
}

/** A height field over `r` that follows the lake outline: pebbles at the water, land beyond. */
function shoreMesh(r: Rect, frame: LakeFrame, landColor: number): THREE.Mesh {
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
  const pebble = new THREE.Color(PEBBLE_COLOR);
  const land = new THREE.Color(landColor);
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
    const t = Math.min(1, Math.max(0, (-d - LAKE.slopeStart) / PEBBLE_FADE));
    c.copy(pebble).lerp(land, t * t * (3 - 2 * t));
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The lake: still dark water in one rectangle, and shore terrain either side of the river mouth
 * whose outline wanders (coves, points, rounded corners, a far shore), so no straight water edge
 * is ever in view. Built once.
 */
export function addLake(scene: THREE.Scene, z: number, landColor: number, bankColor: number): void {
  const r = lakeRects(z);
  const frame: LakeFrame = { z, west: LAKE.west, east: LAKE.east };
  const water = createWaterMesh(r.water.x1 - r.water.x0, r.water.z0 - r.water.z1, LAKE_FLOW);
  water.position.set((r.water.x0 + r.water.x1) / 2, WATER_Y, (r.water.z0 + r.water.z1) / 2);
  scene.add(
    water,
    shoreMesh(r.shoreWest, frame, landColor),
    shoreMesh(r.shoreEast, frame, bankColor),
  );
}
