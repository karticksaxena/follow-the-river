import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as THREE from 'three/webgpu';
import { resolveCircle, type Box } from './collide';
import { createBoxGrid } from './grid';
import type { KeyState } from './input';
import type { LockEvent } from './lock';
import { fall, JUMP_SPEED, moveDelta, moveIntent } from './movement';

export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.3;

export interface Player {
  setColliders(boxes: readonly Box[]): void;
  /** Push the player (e.g. a zombie hit) by dx, dz metres, still respecting walls. */
  shove(dx: number, dz: number): void;
  /** Must be called from a click or key handler (browsers require a user gesture). */
  lock(): void;
  /** Dev `?nolock`: turn the view with plain mouse movement while playing, locked or not. */
  freeLook(on: boolean): void;
  unlock(): void;
  teleport(x: number, z: number, yaw: number): void;
  setSensitivity(sensitivity: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** First-person walker: mouse look via Pointer Lock, WASD + Shift on the ground plane, Space jumps. */
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
  let grid = createBoxGrid([]);
  const scratch = { x: 0, z: 0 };
  const air = { height: 0, speed: 0 };
  // Space must be let go before the next jump: no bunny-hopping, and the Space that closed a page
  // (still held as play resumes) doesn't jump.
  let spaceHeld = true;
  const moveBy = (dx: number, dz: number): void => {
    const x = camera.position.x + dx;
    const z = camera.position.z + dz;
    const next = resolveCircle(x, z, PLAYER_RADIUS, grid.near(x, z, PLAYER_RADIUS + 0.5), scratch);
    camera.position.set(next.x, EYE_HEIGHT + air.height, next.z);
  };
  const jump = (dt: number): void => {
    const down = keys.isDown('Space');
    if (down && !spaceHeld && air.height === 0) air.speed = JUMP_SPEED;
    spaceHeld = down;
    fall(air, dt);
  };
  const player: Player = {
    lock() {
      spaceHeld = true;
      // Ask the browser directly so a refusal can't become an unhandled rejection; refusals
      // still fire 'pointerlockerror'. Safari before 18.4 returns undefined, not a promise.
      const request: unknown = dom.requestPointerLock();
      if (request instanceof Promise) request.catch(() => undefined);
    },
    unlock: () => controls.unlock(),
    freeLook(on) {
      spaceHeld = true;
      controls.isLocked = on;
    },
    teleport(x, z, yaw) {
      air.height = 0;
      air.speed = 0;
      camera.position.set(x, EYE_HEIGHT, z);
      camera.rotation.set(0, yaw, 0, 'YXZ');
    },
    setSensitivity(sensitivity) {
      controls.pointerSpeed = sensitivity;
    },
    setColliders(boxes) {
      grid = createBoxGrid(boxes);
    },
    shove(dx, dz) {
      moveBy(dx, dz);
    },
    update(dt) {
      jump(dt);
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const step = moveDelta(
        moveIntent((code) => keys.isDown(code)),
        forward.x,
        forward.z,
        dt,
      );
      moveBy(step.dx, step.dz);
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
