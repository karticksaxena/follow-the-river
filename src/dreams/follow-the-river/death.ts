import { EYE_HEIGHT } from '../../engine/player';
import type { DreamContext } from '../types';
import type { Flashlight } from './flashlight';
import type { Run } from './run';
import { isNight, type Phase } from './state';

/** The death fall: seconds, final pitch (rad, down), roll (rad) and camera height (m). */
const DEATH = { seconds: 1.2, pitch: -1.1, roll: 0.3, height: 0.4 } as const;

export interface Death {
  start(): void;
  /** Advances the fall; when it ends, shows the "You died." pages and calls `restart`. */
  step(dt: number, phase: () => Phase, restart: () => void): void;
}

/** The camera pitches down, rolls and sinks while the screen goes red (the HUD vignette is already full). */
export function createDeath(ctx: DreamContext, run: Run, flashlight: Flashlight): Death {
  const camera = ctx.stage.camera;
  let x = 0;
  let z = 0;
  return {
    start() {
      if (run.dying !== 'no') return;
      run.dying = 'anim';
      run.dyingTime = 0;
      // The fall stares at the ground: no bright spot (beginPhase sets it per phase on restart).
      flashlight.on = false;
      flashlight.light.intensity = 0;
      x = camera.position.x;
      z = camera.position.z;
    },
    step(dt, phase, restart) {
      if (run.dying !== 'anim' || ctx.isPaused()) return;
      run.dyingTime += dt;
      const k = Math.min(1, run.dyingTime / DEATH.seconds);
      // Runs after the session's player update, so this pose wins over walking and mouse-look.
      camera.position.x = x;
      camera.position.z = z;
      camera.rotation.x = DEATH.pitch * k;
      camera.rotation.z = DEATH.roll * k;
      camera.position.y = EYE_HEIGHT + (DEATH.height - EYE_HEIGHT) * k;
      if (k < 1) return;
      run.dying = 'wait';
      const again = isNight(phase()) ? 'The night starts again.' : 'The day starts again.';
      ctx.read(['You died.', again], restart);
    },
  };
}
