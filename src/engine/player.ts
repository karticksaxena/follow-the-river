import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as THREE from 'three/webgpu';
import { resolveCircle, type Box } from './collide';
import type { KeyState } from './input';
import type { LockEvent } from './lock';
import { moveDelta, moveIntent } from './movement';

export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.3;

export interface Player {
  colliders: Box[];
  /** Must be called from a click or key handler (browsers require a user gesture). */
  lock(): void;
  unlock(): void;
  teleport(x: number, z: number, yaw: number): void;
  setSensitivity(sensitivity: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** First-person walker: mouse look via Pointer Lock, WASD + Shift on the ground plane. */
export function createPlayer(
  camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
  keys: KeyState,
  onLock: (event: LockEvent) => void,
): Player {
  const controls = new PointerLockControls(camera, dom);
  const forward = new THREE.Vector3();
  const onLocked = (): void => onLock('locked');
  const onUnlocked = (): void => onLock('unlocked');
  const onError = (): void => onLock('lock-error');
  controls.addEventListener('lock', onLocked);
  controls.addEventListener('unlock', onUnlocked);
  document.addEventListener('pointerlockerror', onError);
  const player: Player = {
    colliders: [],
    lock() {
      // Ask the browser directly so a refusal can't become an unhandled rejection; refusals
      // still fire 'pointerlockerror'. Safari before 18.4 returns undefined, not a promise.
      const request: unknown = dom.requestPointerLock();
      if (request instanceof Promise) request.catch(() => undefined);
    },
    unlock: () => controls.unlock(),
    teleport(x, z, yaw) {
      camera.position.set(x, EYE_HEIGHT, z);
      camera.rotation.set(0, yaw, 0, 'YXZ');
    },
    setSensitivity(sensitivity) {
      controls.pointerSpeed = sensitivity;
    },
    update(dt) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const step = moveDelta(
        moveIntent((code) => keys.isDown(code)),
        forward.x,
        forward.z,
        dt,
      );
      const next = resolveCircle(
        camera.position.x + step.dx,
        camera.position.z + step.dz,
        PLAYER_RADIUS,
        player.colliders,
      );
      camera.position.set(next.x, EYE_HEIGHT, next.z);
    },
    dispose() {
      controls.removeEventListener('lock', onLocked);
      controls.removeEventListener('unlock', onUnlocked);
      document.removeEventListener('pointerlockerror', onError);
      controls.unlock();
      controls.dispose();
    },
  };
  return player;
}
