import type * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';
import { characterUrl } from './kits';
import type { Weapon } from './weapons';

/** The node of `kartik-arms.glb` holding the arms posed for `weapon` (in the weapon's own frame). */
export const armsNode = (weapon: Weapon): string => `arms_${weapon}`;

/** Kartik's posed first-person arms: one static, single-material mesh per weapon (tools/blender/fp_arms.py). */
export const loadArms = (): Promise<THREE.Object3D> => loadModel(characterUrl('kartik-arms'));

/**
 * Hangs the arms for `weapon` under its viewmodel, so the weapon's kick, switch and bob move them and they show only
 * with it. They have no switch of their own, and no shadow: they are the player's own arms.
 */
export function giveArms(
  view: THREE.Group,
  source: THREE.Object3D,
  weapon: Weapon,
): THREE.Object3D {
  const arms = source.getObjectByName(armsNode(weapon));
  if (!arms) throw new Error(`kartik-arms.glb has no ${armsNode(weapon)}`);
  arms.traverse((n) => (n.castShadow = false));
  view.add(arms);
  return arms;
}
