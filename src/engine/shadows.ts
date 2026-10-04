import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import * as THREE from 'three/webgpu';
import type { Tier } from './quality';

export interface KeyShadowSetup {
  cascades: number;
  mapSize: number;
}

/** Per tier: cascades and map size of the key light's shadows (Low has none). Tuning knobs. */
export const KEY_SHADOWS: Readonly<Record<Tier, KeyShadowSetup | null>> = {
  low: null,
  medium: { cascades: 2, mapSize: 1024 },
  high: { cascades: 3, mapSize: 2048 },
};

/** How far from the camera the cascades reach (m); beyond it nothing is shadowed. */
const MAX_FAR = 80;
/** The shadow camera's depth range (m); cascades place it themselves. */
const SHADOW_DEPTH = 2000;

interface Attached {
  tier: Tier;
  csm: CSMShadowNode;
  /** The cascade lights exist only after the first compile or render; strength is re-applied then. */
  synced: boolean;
  detach(): void;
}
const attached = new WeakMap<THREE.DirectionalLight, Attached>();

/** What a tier gives the key light: `null` (no shadows) or its cascade setup. Pure. */
export function keyShadowSetup(tier: Tier): KeyShadowSetup | null {
  return KEY_SHADOWS[tier];
}

/** Whether the key light has to change: `current` is the tier it was set up for (null: none attached). Pure. */
export function needsShadowChange(current: Tier | null, tier: Tier): boolean {
  return (current ? keyShadowSetup(current) : null) !== keyShadowSetup(tier);
}

/** Cascaded shadows off: the CSM, its listener and its maps are freed. Safe when none are attached. */
export function detachKeyShadows(light: THREE.DirectionalLight): void {
  attached.get(light)?.detach();
}

/**
 * Gives the key light cascaded shadows that follow the camera, sized for `tier` (none on Low).
 * `castShadow` stays on once attached (toggling it recompiles every shader); strength is
 * `setShadowStrength`. Replaces any earlier attachment.
 */
export function attachKeyShadows(light: THREE.DirectionalLight, tier: Tier): void {
  detachKeyShadows(light);
  const setup = keyShadowSetup(tier);
  if (!setup) return;
  light.castShadow = true;
  light.shadow.mapSize.set(setup.mapSize, setup.mapSize);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_DEPTH;
  light.shadow.bias = -0.0004;
  light.shadow.radius = 3; // soft edges for the moon
  const csm = new CSMShadowNode(light, {
    cascades: setup.cascades,
    maxFar: MAX_FAR,
    mode: 'practical',
  });
  light.shadow.shadowNode = csm;
  const onResize = (): void => {
    if (csm.mainFrustum) csm.updateFrustums();
  };
  addEventListener('resize', onResize);
  const entry: Attached = {
    tier,
    csm,
    synced: false,
    detach() {
      removeEventListener('resize', onResize);
      csm.dispose();
      light.shadow.shadowNode = undefined;
      light.shadow.dispose(); // the map
      light.castShadow = false;
      attached.delete(light);
    },
  };
  attached.set(light, entry);
}

/**
 * Per frame (cheap): rebuilds the cascades when the graphics tier changed (Auto stepping down to
 * relieve the GPU), and re-applies the strength once the cascade lights exist.
 */
export function syncKeyShadows(light: THREE.DirectionalLight, tier: Tier): void {
  const current = attached.get(light);
  if (needsShadowChange(current?.tier ?? null, tier)) {
    const strength = light.shadow.intensity;
    attachKeyShadows(light, tier);
    light.shadow.intensity = strength;
    return;
  }
  if (current && !current.synced && current.csm.lights.length > 0) {
    current.synced = true;
    setShadowStrength(light, light.shadow.intensity);
  }
}

function setOne(shadow: THREE.LightShadow, strength: number, on: boolean, refresh: boolean): void {
  shadow.intensity = strength;
  shadow.autoUpdate = on;
  if (refresh) shadow.needsUpdate = true;
}

/**
 * Key shadow strength 0..1. At 0 the shadow passes stop (autoUpdate off); back above 0 they render
 * again. Allocation-free: safe per frame. The cascade lights exist only after the first compile or
 * render (`syncKeyShadows` re-applies it then). Does nothing without `attachKeyShadows`.
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
