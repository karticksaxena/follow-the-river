import * as THREE from 'three/webgpu';

// Tuning knobs (metres, colours): the phone Mom films with.
export const PHONE = { w: 0.075, h: 0.15, d: 0.009, body: 0x15171b, screen: 0x6f86b0 } as const;
/**
 * Everything below is in the WristR bone's frame as the Film clip poses it (wrist X = down,
 * Y = forward along the fingers, Z = her left; the hand is a flat mitten, thumb up, palm and
 * curled fingers on the -Z side). Measured from the skinned hand vertices of mom.glb: the phone's
 * back face sits 4 mm off the palm side, clear of every hand vertex.
 */
export const PHONE_GRIP = 0; // the whole seat is PHONE_OFFSET
export const PHONE_OFFSET = new THREE.Vector3(0.02, 0.09, -0.0409);
/** Long edge along the fingers (-> up once rolled), screen normal out of the palm (-wrist Z). */
export const PHONE_TILT = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, -1),
  ),
);

/**
 * Filming turns her wrist (a rotation in the bone's own frame, post-multiplied) so the palm, and
 * the screen on it, faces her head and the fingers point up. Derived from mom.glb at Film mid-clip:
 * the rotation taking the posed WristR frame to one with -Z toward her Head bone and Y as near
 * world up as that allows. About 93 degrees (the bone's limit is 110).
 */
export const FILM_WRIST_ROLL = new THREE.Quaternion(
  -0.25106,
  0.55961,
  0.39099,
  0.68624,
).normalize();
const ROLL_RATE = 8; // 1/s: the roll is ~95% in by 0.4 s

/** Pure: eases the roll weight toward 1 (phone up) or 0. */
export function rollStep(weight: number, on: boolean, dt: number): number {
  return weight + ((on ? 1 : 0) - weight) * (1 - Math.exp(-ROLL_RATE * dt));
}

/**
 * Rolls a wrist by `weight` of FILM_WRIST_ROLL; call it after the mixer has posed the bone. A
 * static clip pose is not rewritten by the mixer each frame (it skips unchanged values), so the
 * roll is applied to a remembered base, never on top of its own last result. No allocation per call.
 */
export function createFilmRoll(): (wrist: THREE.Object3D, weight: number) => void {
  const base = new THREE.Quaternion(); // the pose the animation gave
  const out = new THREE.Quaternion(); // what we last wrote
  const rolled = new THREE.Quaternion();
  let wrote = false;
  return (wrist, weight) => {
    if (!wrote || !wrist.quaternion.equals(out)) base.copy(wrist.quaternion); // the mixer rewrote it
    if (weight <= 0.001) {
      if (wrote) wrist.quaternion.copy(base); // roll finished: hand the bone back
      wrote = false;
      return;
    }
    rolled.copy(base).multiply(FILM_WRIST_ROLL);
    wrist.quaternion.copy(base).slerp(rolled, weight);
    out.copy(wrist.quaternion);
    wrote = true;
  };
}

/** A dark slab with a dim screen on its +Z face (dim, so bloom only haloes it); hidden until used. */
export function makePhone(): THREE.Group {
  const phone = new THREE.Group();
  const mount = new THREE.Group(); // seats the slab in the hand: the outer group is what attach moves
  mount.position.copy(PHONE_OFFSET);
  mount.quaternion.copy(PHONE_TILT);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(PHONE.w, PHONE.h, PHONE.d),
    new THREE.MeshStandardMaterial({ color: PHONE.body, roughness: 0.4 }),
  );
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(PHONE.w * 0.9, PHONE.h * 0.93),
    new THREE.MeshBasicMaterial({ color: PHONE.screen }),
  );
  screen.position.z = PHONE.d / 2 + 0.0004;
  mount.add(body, screen);
  phone.add(mount);
  phone.visible = false;
  return phone;
}
