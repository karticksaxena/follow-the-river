import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';

/**
 * Night details for the dam prop (local coords: x along the crest, y up, +z downstream): a few
 * dim lit windows on the control house and a row of lamp dots along the crest railing, as one
 * merged unlit mesh (no real lights). Dim on purpose, never bright. Tuning knobs.
 */
const WINDOW_COLOR = 0x8a5a26;
const LAMP_COLOR = 0x5a3e1c;
/** The house front is at z -1; windows sit 4 cm proud of it. Each is [centre x, centre y, width]. */
const HOUSE_FRONT_Z = -0.96;
const WINDOWS: readonly (readonly [number, number, number])[] = [
  [-17.5, 19.9, 0.6],
  [-15.2, 19.9, 0.8],
  [-12.6, 19.9, 0.6],
];
const WINDOW_HEIGHT = 0.9;
/** Lamp dots on the downstream rail posts: spacing, size, height, depth; skipping the spillway and house. */
const LAMP_SPACING = 4;
const LAMP_SIZE = 0.35;
const LAMP_Y = 19.2;
const LAMP_Z = -1.3;
const LAMP_SPILLWAY_HALF = 5;
const HOUSE_X: readonly [number, number] = [-18.5, -11.5];
const CREST_HALF = 22;

function quad(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  hex: number,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(x, y, z);
  const c = new THREE.Color(hex);
  const colors = new Float32Array(4 * 3);
  for (let i = 0; i < 4; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** One mesh (one draw) of every window and lamp, to add as a child of the loaded dam model. */
export function damNightLights(): THREE.Mesh {
  const parts = WINDOWS.map(([x, y, w]) =>
    quad(x, y, HOUSE_FRONT_Z, w, WINDOW_HEIGHT, WINDOW_COLOR),
  );
  for (let x = -CREST_HALF; x <= CREST_HALF; x += LAMP_SPACING) {
    if (Math.abs(x) <= LAMP_SPILLWAY_HALF || (x > HOUSE_X[0] && x < HOUSE_X[1])) continue;
    parts.push(quad(x, LAMP_Y, LAMP_Z, LAMP_SIZE, LAMP_SIZE, LAMP_COLOR));
  }
  const geometry = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  mesh.name = 'dam-night-lights';
  return mesh;
}
