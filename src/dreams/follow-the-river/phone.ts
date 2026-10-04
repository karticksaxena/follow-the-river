import * as THREE from 'three/webgpu';

// Tuning knobs (metres, colours): the phone Mom films with.
export const PHONE = { w: 0.075, h: 0.15, d: 0.009, body: 0x15171b, screen: 0x6f86b0 } as const;
export const PHONE_GRIP = 0.09; // m from the wrist to the phone's centre, along the fingers
/** Spin about the wrist's +Y so the screen faces her (flip by PI if it shows the back). */
export const PHONE_SPIN = Math.PI;

/** A dark slab with a dim screen on its +Z face (dim, so bloom only haloes it); hidden until used. */
export function makePhone(): THREE.Group {
  const phone = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(PHONE.w, PHONE.h, PHONE.d),
    new THREE.MeshStandardMaterial({ color: PHONE.body, roughness: 0.4 }),
  );
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(PHONE.w * 0.9, PHONE.h * 0.93),
    new THREE.MeshBasicMaterial({ color: PHONE.screen }),
  );
  screen.position.z = PHONE.d / 2 + 0.0004;
  phone.add(body, screen);
  phone.rotation.y = PHONE_SPIN;
  phone.visible = false;
  return phone;
}
