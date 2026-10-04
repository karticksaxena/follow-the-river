import * as THREE from 'three/webgpu';
import { assetUrl } from '../../engine/assets';
import { addBatched } from '../../engine/batch';
import { loadModel } from '../../engine/models';
import type { Tier } from '../../engine/quality';
import { NO_REFLECTION_LAYER } from '../../engine/volume';
import { KIT_SCALE, kitUrl } from './kits';
import { FAR_EDGE_X } from './river';
import { type Bend, noBend } from './shore-shape';

export interface Silhouette {
  x: number;
  z: number;
  width: number;
  height: number;
}

export type BuildingModel = 'buildingTall' | 'buildingMid' | 'buildingLow';

/** Repeatable pseudo-random numbers so the skyline is the same every visit. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Silhouettes run from well behind the start (z = 0) to well past the far end (z ≈ -110),
 * further than the fog reaches, so no end of the row is ever visible.
 */
export const SKYLINE_FROM_Z = 90;
export const SKYLINE_SPAN = 290;

/**
 * Distant city blocks across the river and a tree line behind the bank, all well outside
 * the walkable strip. They read as shapes in the fog, so the world never ends at a cliff.
 */
export function skylineLayout(
  seed: number,
  count: number,
  minX: number,
  maxX: number,
  fromZ = SKYLINE_FROM_Z,
  span = SKYLINE_SPAN,
): Silhouette[] {
  const random = seeded(seed);
  const out: Silhouette[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: minX + random() * (maxX - minX),
      z: fromZ - i * (span / count) - random() * 4,
      width: 3 + random() * 6,
      height: 6 + random() * 22,
    });
  }
  return out;
}

/** Which Blender building (tools/blender/river_props.py) fits a silhouette's height. */
export function buildingFor(height: number): BuildingModel {
  if (height > 20) return 'buildingTall';
  if (height > 12) return 'buildingMid';
  return 'buildingLow';
}

const url = (name: string): string => assetUrl(`river/${name}.glb`);

/** Native heights of the Blender props, in metres. Keep in sync with river_props.py. */
const PINE_HEIGHT = 9;
const DEAD_TREE_HEIGHT = 7;
/** The row starts and ends this far beyond the play strip (past the fog). */
const MARGIN = 100;
/** Metres between silhouettes along the row. */
const SPACING = 4.5;
/**
 * The far rows are static, fogged silhouettes: merged into one mesh per material per this many metres
 * of row (a few draws instead of ~100; still culled by section). Tuning knob.
 */
export const SKYLINE_CELL = 128;
const HOUSES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c) => `building-type-${c}`);

export type SkylineStyle = 'city' | 'houses' | 'trees';

interface Item {
  load: Promise<THREE.Object3D>;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

function treeItem(s: Silhouette, i: number): Item {
  const dead = i % 3 === 2;
  return {
    load: loadModel(url(dead ? 'deadTree' : 'pine')),
    x: s.x,
    z: s.z,
    yaw: s.width,
    scale: (s.height * 0.6) / (dead ? DEAD_TREE_HEIGHT : PINE_HEIGHT),
  };
}

/** The far bank: Blender city blocks, suburb houses or more trees, depending on the area. */
function farBankItem(style: SkylineStyle, s: Silhouette, i: number): Item {
  if (style === 'trees') return treeItem({ ...s, x: s.x - 4 }, i);
  if (style === 'houses') {
    const house = HOUSES[Math.floor(s.width * 10) % HOUSES.length];
    return {
      load: loadModel(kitUrl('suburb', house)),
      x: s.x,
      z: s.z,
      yaw: -Math.PI / 2,
      scale: KIT_SCALE.suburb,
    };
  }
  return {
    load: loadModel(url(buildingFor(s.height))),
    x: s.x,
    z: s.z,
    yaw: -Math.PI / 2,
    scale: 1,
  };
}

/**
 * Skyline meshes never cast shadows (far past the shadow reach, or lost in fog); on Medium and Low
 * they also stay out of the water's reflection (layer 3: the camera still sees them).
 */
export function styleFor(model: THREE.Object3D, tier: Tier): void {
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = false;
    if (tier !== 'high') node.layers.set(NO_REFLECTION_LAYER);
  });
}

/** Moves the placed skyline meshes in or out of the reflection when the tier changes mid-chapter. */
export function setSkylineTier(meshes: readonly THREE.Object3D[], tier: Tier): void {
  for (const mesh of meshes) {
    if (tier === 'high') mesh.layers.set(0);
    else mesh.layers.set(NO_REFLECTION_LAYER);
  }
}

/**
 * Places the far-bank silhouettes (windows facing the river) and a tree line behind the bank,
 * spanning `startZ` to `endZ` plus a margin so no end of the row is visible. Past the walkable ends
 * the rows follow the river's `bend`, so the view turns out of sight instead of running straight.
 * Static meshes are merged per material and map cell (addBatched); returns those meshes.
 */
export async function addSkyline(
  scene: THREE.Scene,
  style: SkylineStyle = 'city',
  startZ = 0,
  endZ = -110,
  endMargin = MARGIN,
  bend: Bend = noBend,
  tier: Tier = 'high',
): Promise<THREE.Object3D[]> {
  const from = startZ + MARGIN;
  const span = startZ - endZ + MARGIN + endMargin;
  const count = Math.round(span / SPACING);
  const far = skylineLayout(7, count, FAR_EDGE_X + 5, FAR_EDGE_X + 43, from, span).map((s, i) =>
    farBankItem(style, s, i),
  );
  const near = skylineLayout(11, count, -40, -16, from, span).map(treeItem);
  const items = [...far, ...near];
  const models = await Promise.all(items.map((item) => item.load));
  items.forEach((item, i) => {
    const model = models[i];
    model.position.set(item.x + bend(item.z), 0, item.z);
    model.rotation.y = item.yaw;
    model.scale.setScalar(item.scale);
    styleFor(model, tier);
  });
  const before = scene.children.length; // addBatched is synchronous: the new children are ours
  addBatched(scene, models, SKYLINE_CELL);
  return scene.children.slice(before);
}
