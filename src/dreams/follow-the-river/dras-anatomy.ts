/**
 * Dras measured from the built mesh (tools/blender/orca.py prints them; public/assets/characters/orca.glb).
 * Metres in the model's own space: nose toward -Z, up +Y, origin at the body centre.
 * The `Jaw` bone's rest quaternion is not identity: open it as
 * `jaw.quaternion.copy(rest).multiply(q.setFromAxisAngle(X_AXIS, -open))`, never `jaw.rotation.x`.
 */
export const ANATOMY = {
  length: 7, // every grab, strand and lane distance is built on it
  halfLength: 3.5,
  halfWidth: 0.594, // widest half-width of the body (no fins)
  finHeight: 0.897, // dorsal fin tip above the back
  blowhole: { ahead: 2.38, up: 0.628 }, // from the centre
  eye: { ahead: 2.66, up: -0.045, side: 0.479 },
  bite: { ahead: 3.008, below: 0.132 }, // the middle of the mouth, where a zombie is held
  jawOpen: 0.55, // radians the Jaw bone opens at most
  dentZ: [-2.22, -1.48] as const, // z range of the "peanut head" dent behind the blowhole
} as const;

/** The three skin materials (wet sheen and sickness tint); the eye and mouth keep their own look. */
export const SKIN_MATERIALS: readonly string[] = ['orca-black', 'orca-white', 'orca-grey'];
