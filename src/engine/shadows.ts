import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import * as THREE from 'three/webgpu';
import type { Tier } from './quality';

/** Per tier: cascades and map size of the key light's shadows (Low has none). Tuning knobs. */
export const KEY_SHADOWS: Readonly<Record<Tier, { cascades: number; mapSize: number } | null>> = {
  low: null,
  medium: { cascades: 2, mapSize: 1024 },
  high: { cascades: 3, mapSize: 2048 },
};

/** How far from the camera the cascades reach (m); beyond it nothing is shadowed. */
const MAX_FAR = 80;
/** The shadow camera's depth range (m); cascades place it themselves. */
const SHADOW_DEPTH = 2000;

/**
 * Gives the key light cascaded shadows that follow the camera, sized for `tier`. Fixed for the
 * scene's life: `castShadow` never toggles afterwards (that would recompile every shader), strength
 * is `setShadowStrength`. Returns false (no shadows) on Low.
 */
// ponytail: cascades are chosen once; an Auto tier drop mid-scene keeps them (rebuild on the next scene).
export function attachKeyShadows(light: THREE.DirectionalLight, tier: Tier): boolean {
  const setup = KEY_SHADOWS[tier];
  if (!setup) return false;
  light.castShadow = true;
  light.shadow.mapSize.set(setup.mapSize, setup.mapSize);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_DEPTH;
  light.shadow.bias = -0.0004;
  light.shadow.radius = 3; // soft edges for the moon
  light.shadow.shadowNode = new CSMShadowNode(light, {
    cascades: setup.cascades,
    maxFar: MAX_FAR,
    mode: 'practical',
  });
  const onResize = (): void => {
    const csm = light.shadow.shadowNode;
    if (!light.parent) removeEventListener('resize', onResize);
    else if (csm instanceof CSMShadowNode && csm.mainFrustum) csm.updateFrustums();
  };
  addEventListener('resize', onResize);
  return true;
}

function setOne(shadow: THREE.LightShadow, strength: number, on: boolean, refresh: boolean): void {
  shadow.intensity = strength;
  shadow.autoUpdate = on;
  if (refresh) shadow.needsUpdate = true;
}

/**
 * Key shadow strength 0..1. At 0 the shadow passes stop (autoUpdate off); back above 0 they render
 * again. Allocation-free: safe per frame. The cascade lights exist only after the first compile or
 * render, so call it again then. Does nothing without `attachKeyShadows`.
 */
export function setShadowStrength(light: THREE.DirectionalLight, strength: number): void {
  light.shadow.intensity = strength; // remembered, so a later attach starts at the right strength
  const csm = light.shadow.shadowNode;
  if (!(csm instanceof CSMShadowNode)) return;
  const on = strength > 0.001;
  const refresh = on && !light.shadow.autoUpdate;
  setOne(light.shadow, strength, on, refresh);
  for (let i = 0; i < csm.lights.length; i++) {
    const shadow = csm.lights[i]?.shadow;
    if (shadow) setOne(shadow, strength, on, refresh);
  }
}
