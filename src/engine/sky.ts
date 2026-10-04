import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { attribute, sin, time } from 'three/tsl';
import * as THREE from 'three/webgpu';

const horizonColor = new THREE.Color();
const topColor = new THREE.Color();
const mixed = new THREE.Color();

/** Repaints the dome's vertex colours from `top` to `horizon` (on a lighting change, not per frame). */
export function paintSkyDome(dome: THREE.Mesh, top: number, horizon: number): void {
  const geometry = dome.geometry;
  const position = geometry.getAttribute('position');
  let color = geometry.getAttribute('color');
  if (!color) {
    color = new THREE.Float32BufferAttribute(position.count * 3, 3);
    geometry.setAttribute('color', color);
  }
  horizonColor.set(horizon);
  topColor.set(top);
  let radius = 1e-6;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, position.getY(i));
  for (let i = 0; i < position.count; i++) {
    const height = Math.max(0, position.getY(i) / radius);
    mixed.lerpColors(horizonColor, topColor, Math.sqrt(height));
    color.setXYZ(i, mixed.r, mixed.g, mixed.b);
  }
  color.needsUpdate = true;
}

/**
 * A huge inside-out sphere shaded from `top` to `horizon`, so there is never an empty
 * background edge. Fog is off so the sky keeps its colour; geometry fog hides the ground's end.
 */
export function createSkyDome(top: number, horizon: number, radius = 180): THREE.Mesh {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 12),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  paintSkyDome(dome, top, horizon);
  dome.renderOrder = -1;
  return dome;
}

/** Distance the stars sit at: inside the dome (80 m radius) so they are never past the far plane. */
const STAR_RADIUS = 70;
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
    .mul(0.5);
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
  sky.renderOrder = -1;
  sky.cloudCoverage.value = 0;
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
