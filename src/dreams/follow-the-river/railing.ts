import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three/webgpu';

/** The city's near railing, which the orca smashes through where it bursts out after a zombie. */
export interface Railing {
  /** Breaks the bays around z: they vanish and their pieces fly onto the road. */
  break(z: number): void;
  update(dt: number): void;
  /** Whole again (a restarted night). */
  reset(): void;
}

/** Tuning knobs (metres, seconds). */
export const RAILING_BREAK = {
  /** Bays within this distance of the orca's z break. */
  halfWidth: 2.6,
  /** Pieces fly inland (−x) and up, spinning. */
  throwX: [3, 5.5],
  throwY: [2.5, 4],
  spin: 7,
  gravity: 9.8,
  /** Broken pieces kept lying around at once (older ones are reused). */
  pool: 12,
} as const;

export interface RailStyle {
  x: number;
  postHeight: number;
  spacing: number;
}

/** One bay: a post at its near end (local z 0) and two rails running spacing metres toward −z. */
export function bayGeometry(style: RailStyle): THREE.BufferGeometry {
  const { postHeight: h, spacing: s } = style;
  return mergeGeometries([
    new THREE.BoxGeometry(0.08, h, 0.08).translate(0, h / 2, 0),
    new THREE.BoxGeometry(0.05, 0.05, s).translate(0, h / 2, -s / 2),
    new THREE.BoxGeometry(0.05, 0.05, s).translate(0, h, -s / 2),
  ]);
}

/** Pure: the bays (by index from z0, every `spacing` m toward z1) whose span touches [z−w, z+w]. */
export function baysNear(
  z: number,
  z0: number,
  spacing: number,
  count: number,
  w: number,
): [number, number] {
  const first = Math.max(0, Math.floor((z0 - (z + w)) / spacing));
  const last = Math.min(count - 1, Math.floor((z0 - (z - w)) / spacing));
  return [first, last];
}

interface Piece {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  spin: number;
  flying: boolean;
}

const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
const placed = new THREE.Matrix4();

const between = ([a, b]: readonly [number, number]): number => a + Math.random() * (b - a);

function launch(p: Piece, x: number, z: number): void {
  p.mesh.visible = true;
  p.mesh.position.set(x, 0, z);
  p.mesh.rotation.set(0, Math.random() - 0.5, 0);
  p.vx = -between(RAILING_BREAK.throwX);
  p.vy = between(RAILING_BREAK.throwY);
  p.spin = (Math.random() - 0.5) * 2 * RAILING_BREAK.spin;
  p.flying = true;
}

function fly(p: Piece, dt: number): void {
  if (!p.flying) return;
  const m = p.mesh;
  p.vy -= RAILING_BREAK.gravity * dt;
  m.position.x += p.vx * dt;
  m.position.y += p.vy * dt;
  m.rotation.z += p.spin * dt;
  m.rotation.x += p.spin * 0.6 * dt;
  if (m.position.y > 0 || p.vy > 0) return;
  // Down on the road, flat: the post tips over (about z), the rails stay level.
  m.position.y = 0.04;
  m.rotation.set(0, m.rotation.y, Math.PI / 2);
  p.flying = false;
}

/** Instanced bays from z0 down to z1 at style.x, with a pool of pieces for the breaks. */
export function createRailing(
  scene: THREE.Scene,
  style: RailStyle,
  z0: number,
  z1: number,
  material: THREE.Material,
): Railing {
  const geometry = bayGeometry(style);
  const count = Math.floor((z0 - z1) / style.spacing) + 1;
  const bays = new THREE.InstancedMesh(geometry, material, count);
  const intact = (): void => {
    for (let i = 0; i < count; i++) {
      bays.setMatrixAt(i, placed.makeTranslation(style.x, 0, z0 - i * style.spacing));
    }
    bays.instanceMatrix.needsUpdate = true;
  };
  intact();
  bays.frustumCulled = false; // one instanced mesh spans the whole strip
  const pieces: Piece[] = Array.from({ length: RAILING_BREAK.pool }, () => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    return { mesh, vx: 0, vy: 0, spin: 0, flying: false };
  });
  scene.add(bays, ...pieces.map((p) => p.mesh));
  let next = 0;
  return {
    break(z) {
      const [first, last] = baysNear(z, z0, style.spacing, count, RAILING_BREAK.halfWidth);
      for (let i = first; i <= last; i++) {
        bays.getMatrixAt(i, placed);
        if (placed.elements[0] === 0) continue; // already broken
        bays.setMatrixAt(i, hidden);
        launch(pieces[next], style.x, z0 - i * style.spacing);
        next = (next + 1) % pieces.length;
      }
      bays.instanceMatrix.needsUpdate = true;
    },
    update(dt) {
      for (const p of pieces) fly(p, dt);
    },
    reset() {
      intact();
      for (const p of pieces) {
        p.mesh.visible = false;
        p.flying = false;
      }
    },
  };
}
