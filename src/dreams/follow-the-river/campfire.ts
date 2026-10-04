import {
  color,
  float,
  mix,
  mx_noise_float,
  positionLocal,
  sin,
  smoothstep,
  time,
  uv,
  vec3,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { loadModel } from '../../engine/models';
import { KIT_SCALE, kitUrl } from './kits';

/** The camp's fire: tuning knobs. A low, warm glow (never bright). */
export const CAMPFIRE = {
  /** Warm light over the pit, flickering by ±`flicker` of its intensity. */
  light: { color: 0xff7a35, intensity: 7, distance: 11, height: 0.9, flicker: 0.3 },
  /** Flame tongues: crossed planes over the logs (m). */
  flame: { width: 0.9, height: 1.35, base: 0.15, count: 3, speed: 1.6 },
  /** Base to tip: deep orange to dim yellow. */
  colors: { base: 0xff5a14, tip: 0xffb347 },
  /** Footprint you can't walk through (m), so you sit beside the fire, not in it. */
  solid: 1.3,
} as const;

/** A flame tongue: wide at the base, flickering to a point, eaten at the edges by rising noise. */
function flameMaterial(seed: number): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const p = uv();
  const rise = time.mul(CAMPFIRE.flame.speed);
  const noise = mx_noise_float(vec3(p.x.mul(3.5), p.y.mul(2.5).sub(rise), seed))
    .mul(0.5)
    .add(0.5);
  const half = float(1).sub(p.y).mul(0.45).add(0.05);
  const across = smoothstep(half, half.mul(0.2), p.x.sub(0.5).abs());
  const up = smoothstep(float(0.95), float(0.25), p.y.add(noise.mul(0.4)));
  material.colorNode = mix(color(CAMPFIRE.colors.base), color(CAMPFIRE.colors.tip), p.y);
  material.opacityNode = across.mul(up).mul(0.85);
  // The tip sways more than the base.
  const sway = sin(time.mul(5).add(seed * 7))
    .mul(0.06)
    .mul(p.y);
  material.positionNode = positionLocal.add(vec3(sway, 0, 0));
  return material;
}

function addFlames(group: THREE.Group): THREE.Mesh {
  const { width, height, base, count } = CAMPFIRE.flame;
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, height / 2 + base, 0);
  let first: THREE.Mesh | null = null;
  for (let i = 0; i < count; i++) {
    const tongue = new THREE.Mesh(geometry, flameMaterial(i * 3.1));
    tongue.rotation.y = (i * Math.PI) / count;
    tongue.renderOrder = 2;
    group.add(tongue);
    first ??= tongue;
  }
  if (!first) throw new Error('a campfire needs at least one flame');
  return first;
}

/**
 * The fire the player rests by to wait for dark: the Kenney pit, flame tongues and a flickering
 * warm light. Returns the collider so nobody stands in the flames.
 */
export async function addCampfire(scene: THREE.Scene, x: number, z: number): Promise<Box> {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const pit = await loadModel(kitUrl('survival', 'campfire-pit'));
  pit.scale.setScalar(KIT_SCALE.survival);
  group.add(pit);
  const { light: l } = CAMPFIRE;
  const light = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
  light.position.y = l.height;
  group.add(light);
  // The flames draw every frame the fire is in view: flicker the light there, no updater needed.
  addFlames(group).onBeforeRender = () => {
    const t = performance.now() / 1000;
    const wave = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 13.7 + 1.3) * 0.3 + Math.sin(t * 3.3) * 0.2;
    light.intensity = l.intensity * (1 + wave * l.flicker);
  };
  scene.add(group);
  return boxAt(x, z, CAMPFIRE.solid, CAMPFIRE.solid);
}
