import * as THREE from 'three/webgpu';

/** One key of a camera rail: where the camera is and what it looks at (world, metres). */
export interface RailKey {
  at: readonly [number, number, number];
  look: readonly [number, number, number];
}

export interface Rail {
  readonly seconds: number;
  /** Puts `camera` where the rail is `t` seconds in (clamped to 0..seconds). Allocates nothing. */
  pose(t: number, camera: THREE.Camera): void;
}

const smooth = (s: number): number => s * s * (3 - 2 * s);
const clamp01 = (s: number): number => Math.min(1, Math.max(0, s));
const curveOf = (points: readonly (readonly [number, number, number])[]): THREE.CatmullRomCurve3 =>
  new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));

/**
 * A camera move through `keys` over `seconds`: a Catmull-Rom curve through the camera positions and
 * another through the look points, walked with a smoothstep so it eases in and out. Allocates only here.
 */
export function createRail(keys: readonly RailKey[], seconds: number): Rail {
  const at = curveOf(keys.map((k) => k.at));
  const look = curveOf(keys.map((k) => k.look));
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();
  return {
    seconds,
    pose(t, camera) {
      const u = smooth(clamp01(t / seconds));
      camera.position.copy(at.getPoint(u, p));
      camera.lookAt(look.getPoint(u, l));
    },
  };
}

/**
 * Keys on a circle of `radius` m around `centre` (y = the look height), `n` of them from `fromAngle`
 * to `toAngle` (radians; 0 is +z, angles turn toward +x), the camera's world y going from
 * `heights[0]` to `heights[1]`. Every key looks at the centre.
 */
export function orbitKeys(
  centre: { x: number; y: number; z: number },
  radius: number,
  fromAngle: number,
  toAngle: number,
  heights: readonly [number, number],
  n: number,
): RailKey[] {
  return Array.from({ length: n }, (_, i) => {
    const s = n > 1 ? i / (n - 1) : 0;
    const a = fromAngle + (toAngle - fromAngle) * s;
    return {
      at: [
        centre.x + Math.sin(a) * radius,
        heights[0] + (heights[1] - heights[0]) * s,
        centre.z + Math.cos(a) * radius,
      ],
      look: [centre.x, centre.y, centre.z],
    };
  });
}
