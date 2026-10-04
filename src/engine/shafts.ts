import {
  cameraFar,
  cameraNear,
  float,
  Fn,
  If,
  interleavedGradientNoise,
  Loop,
  perspectiveDepthToViewZ,
  screenCoordinate,
  screenUV,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { shaftFacing, SHAFTS, type ShaftSource } from './volume';

type Depth = { sample(uv: THREE.Node): THREE.Node<'vec4'> };

/** The god rays: screen-space light shafts toward the sun, through gaps in whatever stands against the sky. */
export interface Shafts {
  /** HDR colour to add (zero when off); a uniform-gated branch, so it costs nothing at level 0. */
  readonly node: THREE.Node<'vec3'>;
  /** Per frame, allocation-free: aims at `source` and sets the level. */
  update(source: ShaftSource, camera: THREE.PerspectiveCamera): void;
}

const aim = new THREE.Vector3();
const look = new THREE.Vector3();

/** `depth` is a perspective depth texture node (the pre-pass depth). Nothing here owns GPU targets. */
export function createShafts(depth: Depth): Shafts {
  const sunUV = uniform(new THREE.Vector2());
  const level = uniform(0);
  const color = uniform(new THREE.Color());
  const sky = (uv: THREE.Node): THREE.Node<'float'> =>
    step(
      cameraFar.mul(SHAFTS.skyFrom),
      perspectiveDepthToViewZ(depth.sample(uv).r, cameraNear, cameraFar).negate(),
    );
  const node = Fn(() => {
    const out = vec3(0).toVar();
    If(level.greaterThan(0.001), () => {
      const delta = sunUV.sub(screenUV).mul(SHAFTS.reach / SHAFTS.samples);
      const uv = screenUV.add(delta.mul(interleavedGradientNoise(screenCoordinate))).toVar();
      const acc = float(0).toVar();
      const weight = float(1).toVar();
      Loop(SHAFTS.samples, () => {
        acc.addAssign(sky(uv).mul(weight));
        weight.mulAssign(SHAFTS.decay);
        uv.addAssign(delta);
      });
      const open = float(1).sub(sky(screenUV).mul(0.7)); // sky pixels glow less: no extra blowout
      out.assign(color.mul(acc.div(SHAFTS.samples)).mul(level).mul(open).mul(SHAFTS.peak));
    });
    return out;
  })();
  return {
    node,
    update(source, camera) {
      const d = source.direction;
      aim.set(d.x, d.y, d.z).multiplyScalar(100).add(camera.position);
      look.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const facing = shaftFacing(look.x * d.x + look.y * d.y + look.z * d.z);
      aim.project(camera);
      sunUV.value.set(aim.x * 0.5 + 0.5, 0.5 - aim.y * 0.5);
      color.value.setRGB(source.color.r, source.color.g, source.color.b);
      level.value = source.level * facing;
    },
  };
}
