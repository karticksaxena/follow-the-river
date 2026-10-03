import type * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';

/**
 * A tall figure standing still in the fog down the bank. Walk close and it is gone.
 * Position, trigger distance (m) and how long it stays after the sting (s). Tuning knobs.
 */
export const WATCHER = { x: 0.8, z: -44, trigger: 13, vanishAfter: 0.25 } as const;

export type WatcherState = 'waiting' | 'struck';

/** The scare fires once, the first time the player comes within reach. */
export function shouldStrike(state: WatcherState, distance: number): boolean {
  return state === 'waiting' && distance < WATCHER.trigger;
}

/**
 * The Blender-made figure (tools/blender/river_props.py `watcher`): too tall, too thin,
 * arms past the knees, a tilted head and two faintly glowing red eyes facing the player.
 */
export function loadWatcherFigure(): Promise<THREE.Object3D> {
  return loadModel('/assets/river/watcher.glb');
}
