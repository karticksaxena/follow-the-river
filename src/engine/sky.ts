import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import {
  attribute,
  materialOpacity,
  mix,
  mx_noise_float,
  positionLocal,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';

/** What drives a dome's look: all uniforms, so repainting uploads nothing. */
interface DomeLook {
  top: { value: THREE.Color };
  horizon: { value: THREE.Color };
  /** 0..1: how much a drifting overcast darkens and lightens the sky. */
  clouds: { value: number };
  material: THREE.MeshBasicNodeMaterial;
}
const looks = new WeakMap<THREE.Object3D, DomeLook>();

/** Overcast cloud cover scale (bigger = smaller clouds) and drift speed (per second). Tuning knobs. */
const CLOUD = { scale: 2.2, drift: 0.012, contrast: 0.3 } as const;

/** Sets the dome's gradient from `top` to `horizon` (a number or a Color). Allocation-free; no GPU upload. */
export function paintSkyDome(
  dome: THREE.Mesh,
  top: THREE.ColorRepresentation,
  horizon: THREE.ColorRepresentation,
): void {
  const look = looks.get(dome);
  if (!look) return;
  look.top.value.set(top);
  look.horizon.value.set(horizon);
}

/** Dome opacity 0..1 (0 hides it: no draw) and the overcast amount 0..1. Allocation-free. */
export function setDomeLook(dome: THREE.Mesh, opacity: number, clouds: number): void {
  const look = looks.get(dome);
  if (!look) return;
  look.material.opacity = opacity;
  look.material.visible = opacity > 0.001;
  look.clouds.value = clouds;
}

/**
 * A huge inside-out sphere shaded from `top` to `horizon` (and, when asked, a slowly drifting overcast),
 * so there is never an empty background edge. Fog is off so the sky keeps its colour; geometry fog
 * hides the ground's end.
 */
export function createSkyDome(
  top: THREE.ColorRepresentation,
  horizon: THREE.ColorRepresentation,
  radius = 180,
): THREE.Mesh {
  const topU = uniform(new THREE.Color(top));
  const horizonU = uniform(new THREE.Color(horizon));
  const clouds = uniform(0);
  const dir = positionLocal.normalize();
  const height = dir.y.max(0);
  const base = mix(horizonU, topU, height.sqrt());
  // A cloud layer projected onto a plane overhead; it fades out toward the horizon.
  const plane = dir.xz.div(dir.y.max(0.15)).mul(CLOUD.scale);
  const noise = mx_noise_float(vec3(plane.x.add(time.mul(CLOUD.drift)), plane.y, time.mul(0.01)));
  const patch = smoothstep(0.35, 0.65, noise.mul(0.5).add(0.5)).sub(0.5);
  const shade = patch.mul(clouds).mul(CLOUD.contrast).mul(height.min(0.5).mul(2)).add(1);
  const material = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    transparent: true,
  });
  material.colorNode = base.mul(shade);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), material);
  looks.set(dome, { top: topU, horizon: horizonU, clouds, material });
  dome.renderOrder = -1;
  return dome;
}

/** The stage camera's far plane (m). */
export const CAMERA_FAR = 200;
/**
 * The sky layers sit at the very back of the depth range, so nothing real is ever behind them: the
 * dome and the physical sky are drawn after the opaque scene and would paint over any far silhouette
 * beyond them. (Fog is fully opaque long before: no preset's fog reaches this far.)
 */
export const SKY_RADIUS = CAMERA_FAR * 0.95;
/** Stars, moon, halo and sun disc sit just inside the dome. */
export const SKY_LAYER_RADIUS = CAMERA_FAR * 0.9;
/** The distance preset disc sizes were tuned at (a size is a radius in metres at this distance). */
export const DISC_REFERENCE = 70;
const STAR_RADIUS = SKY_LAYER_RADIUS;
const STAR_COUNT = 1500;
const STAR_COLOR = 0x9fb0d0;

/** Deterministic 0..1 sequence (mulberry32): the same sky every run, no Math.random. */
function sequence(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** About 1500 faint 1 px stars on the upper sky, each twinkling on its own phase (GPU-side, no per-frame JS). */
export function createStars(): THREE.Points {
  const rand = sequence(1337);
  const positions = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const y = 0.05 + rand() * 0.95; // above the horizon haze only
    const ring = Math.sqrt(1 - y * y);
    const angle = rand() * Math.PI * 2;
    positions.set(
      [Math.cos(angle) * ring * STAR_RADIUS, y * STAR_RADIUS, Math.sin(angle) * ring * STAR_RADIUS],
      i * 3,
    );
    phases[i] = rand() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.PointsNodeMaterial({
    color: STAR_COLOR,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  material.opacityNode = sin(time.mul(1.4).add(attribute('phase', 'float')))
    .mul(0.2)
    .add(0.6)
    .mul(0.5)
    .mul(materialOpacity); // `material.opacity` fades the whole field
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  return stars;
}

/** Scale of the physical sky's box: its half-size must stay inside the dome. */
const PHYSICAL_SCALE = 100;

/** The physical sky (Preetham scattering, a sun disc, drifting clouds), a child of the dome so it follows the camera. */
export function createPhysicalSky(): SkyMesh {
  const sky = new SkyMesh();
  sky.scale.setScalar(PHYSICAL_SCALE);
  sky.renderOrder = -2; // under the painted dome, which fades out over it
  sky.cloudCoverage.value = 0;
  sky.showSunDisc.value = 0; // the sun is a modest disc of our own: the shader's disc blooms to white
  return sky;
}

/** Sets the physical sky's look and the direction of its sun (a unit vector). */
export function setPhysicalSky(
  sky: SkyMesh,
  look: { turbidity: number; rayleigh: number; mie: number; mieG: number },
  sun: { x: number; y: number; z: number },
): void {
  sky.turbidity.value = look.turbidity;
  sky.rayleigh.value = look.rayleigh;
  sky.mieCoefficient.value = look.mie;
  sky.mieDirectionalG.value = look.mieG;
  sky.sunPosition.value.set(sun.x, sun.y, sun.z);
}

/**
 * Compiles the physical sky's shader now (hidden meshes are skipped by `compileAsync`), parked far
 * below the world so no frame can show it, then puts it back as it was.
 */
export async function precompileSky(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  sky: SkyMesh,
): Promise<void> {
  const [visible, y] = [sky.visible, sky.position.y];
  sky.visible = true;
  sky.position.y = -1e4;
  await renderer.compileAsync(scene, camera);
  sky.visible = visible;
  sky.position.y = y;
}

const MOON_SIZE = 256;

/**
 * The moon's face: pale grey, dark maria (seas) as soft blobs, a scatter of craters and a darker
 * limb, drawn once on a canvas (deterministic, original art). Null without a DOM.
 */
// ponytail: procedural; swap in NASA's CGI Moon Kit colour map (public domain) when it can be fetched.
function moonTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = MOON_SIZE;
  canvas.height = MOON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = MOON_SIZE / 2;
  const rand = sequence(4720);
  ctx.fillStyle = '#c9ccd2';
  ctx.fillRect(0, 0, MOON_SIZE, MOON_SIZE);
  const blob = (x: number, y: number, size: number, alpha: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, size);
    g.addColorStop(0, `rgba(70,76,88,${alpha})`);
    g.addColorStop(1, 'rgba(70,76,88,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
  };
  for (const [x, y, size] of [
    [0.38, 0.32, 0.2],
    [0.55, 0.4, 0.16],
    [0.62, 0.6, 0.14],
    [0.34, 0.5, 0.12],
    [0.48, 0.68, 0.1],
  ] as const) {
    blob(x * MOON_SIZE, y * MOON_SIZE, size * MOON_SIZE, 0.75);
  }
  for (let i = 0; i < 90; i++) blob(rand() * MOON_SIZE, rand() * MOON_SIZE, 2 + rand() * 7, 0.35);
  const limb = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = limb;
  ctx.fillRect(0, 0, MOON_SIZE, MOON_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The moon's angular radius (rad): about 4 degrees across. */
const MOON_ANGULAR = 0.035;
/** Radius of the moon disc at the sky layers' distance (a child of the dome). */
export const MOON_RADIUS = SKY_LAYER_RADIUS * MOON_ANGULAR;
/** The halo's radius in moon radii. */
export const MOON_HALO = 3;

/** A round textured moon; a child of the dome, placed by the caller. Dim: the night stays dark. */
export function createMoon(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      map: moonTexture(),
      color: 0xc4ccdc,
      fog: false,
      depthWrite: false,
      transparent: true,
    }),
  );
}

/** A soft additive glow behind the moon; `map` is the caller's round glow texture. */
export function createHalo(map: THREE.Texture | null): THREE.Mesh {
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      map,
      color: 0x3a4558,
      fog: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.renderOrder = -1;
  return halo;
}
