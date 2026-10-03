import * as THREE from 'three/webgpu';

const SHADOW_OPACITY = 0.35;
/** Seconds the orca takes to roll over and sink at the end. */
export const SINK_TIME = 6;

/**
 * The ids of the `n` candidates nearest the player, nearest first: the last lunge takes the ones
 * about to reach you, in plain view, not stragglers lost in the fog. Allocates: rare.
 */
export function nearestTo(
  candidates: ArrayLike<number>,
  count: number,
  n: number,
  player: { x: number; z: number },
): number[] {
  const rows: { id: number; d: number }[] = [];
  for (let i = 0; i < count; i++) {
    const dx = candidates[i * 3 + 1] - player.x;
    const dz = candidates[i * 3 + 2] - player.z;
    rows.push({ id: candidates[i * 3], d: dx * dx + dz * dz });
  }
  return rows
    .toSorted((a, b) => a.d - b.d)
    .slice(0, n)
    .map((r) => r.id);
}

/** How far a sink has gone: depth 0..1 and the roll in radians (it rolls over in the first half). */
export function sinkPose(t: number): { depth: number; roll: number } {
  const s = Math.min(1, Math.max(0, t / SINK_TIME));
  return { depth: s * s * (3 - 2 * s), roll: Math.PI * Math.min(1, s * 2) };
}

export function makeShadow(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, '#000');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    color: 0x000000,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(3, 8, 1); // rotated by yaw below: long axis follows the orca's body (z)
  mesh.renderOrder = 1;
  return mesh;
}
