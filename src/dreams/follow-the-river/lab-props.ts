import * as THREE from 'three/webgpu';

type Vec = readonly [number, number, number];

/** Her monitor on the bench 0.6 m in front of her face (bench top y 0.94): a cold blue-white glow, not white-hot. */
const LAB_MONITOR = {
  at: [0.9, 0.94, -2.35] as Vec,
  size: [0.7, 0.42] as const,
  neckHeight: 0.2,
  glow: { color: 0x9cc4ee, intensity: 1.1 },
  casing: 0x14171b,
} as const;
/** The microphone between Mom and the screen, a little to the camera's side (+X) so her body does not hide it. */
const LAB_MIC = { at: [1.2, 0.94, -2.12] as Vec, color: 0x9096a0, standHeight: 0.24 } as const;

/** The desk monitor: casing, neck, and a lit panel facing +Z (toward Mom and the camera side). */
export function makeMonitor(): THREE.Group {
  const { at, size, neckHeight, glow, casing } = LAB_MONITOR;
  const dark = new THREE.MeshStandardMaterial({ color: casing, roughness: 0.6 });
  const [w, h] = size;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), dark);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.04, h - 0.04),
    new THREE.MeshStandardMaterial({
      color: casing,
      emissive: glow.color,
      emissiveIntensity: glow.intensity,
    }),
  );
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, neckHeight, 0.04), dark);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.18), dark);
  frame.position.y = neckHeight + h / 2;
  panel.position.set(0, neckHeight + h / 2, 0.021);
  neck.position.y = neckHeight / 2;
  foot.position.y = 0.01;
  const monitor = new THREE.Group();
  monitor.add(frame, panel, neck, foot);
  monitor.position.set(...at);
  return monitor;
}

/** A desk microphone: weighted base, thin stand, capsule head tilted toward Mom. */
export function makeMic(): THREE.Group {
  const { at, color, standHeight } = LAB_MIC;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.6 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 16), mat);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, standHeight, 8), mat);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.1, 4, 12), mat);
  base.position.y = 0.01;
  stand.position.y = standHeight / 2;
  head.position.set(0, standHeight + 0.06, 0.03);
  head.rotation.x = -0.5;
  const mic = new THREE.Group();
  mic.add(base, stand, head);
  mic.position.set(...at);
  return mic;
}
