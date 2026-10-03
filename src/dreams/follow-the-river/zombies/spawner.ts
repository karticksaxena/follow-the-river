/** Tuning knobs for night spawns. */
export const SPAWNER = {
  /** Seconds between spawns. */
  interval: 2.2,
  /** Most zombies alive at once (also the pool size). */
  cap: 14,
  /** Spawn ring: inside the night fog (far 55) but out of the flashlight (22). */
  minDistance: 26,
  maxDistance: 40,
  /** Share of spawns placed downstream, ahead of the player. */
  ahead: 0.7,
  /** No new zombies this close to the safe spot, so arriving feels safe. */
  quietNearSafe: 35,
} as const;

export interface Strip {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface SpawnPoint {
  x: number;
  z: number;
}

const TRIES = 6;

function candidate(
  player: { x: number; z: number },
  strip: Strip,
  random: () => number,
): SpawnPoint {
  const distance = SPAWNER.minDistance + random() * (SPAWNER.maxDistance - SPAWNER.minDistance);
  const x = strip.minX + random() * (strip.maxX - strip.minX);
  const dx = x - player.x;
  const along = Math.sqrt(Math.max(0, distance * distance - dx * dx));
  const sign = random() < SPAWNER.ahead ? -1 : 1;
  return { x, z: player.z + sign * along };
}

/** Where to put the next night zombie, or null (cap reached, timer running, or no valid spot). */
export function nextSpawn(
  state: { timer: number },
  dt: number,
  alive: number,
  player: { x: number; z: number },
  strip: Strip,
  safeZ: number,
  blocked: (x: number, z: number) => boolean,
  random: () => number,
): SpawnPoint | null {
  state.timer -= dt;
  if (state.timer > 0 || alive >= SPAWNER.cap) return null;
  if (player.z - safeZ < SPAWNER.quietNearSafe) return null;
  state.timer = SPAWNER.interval;
  for (let i = 0; i < TRIES; i++) {
    const p = candidate(player, strip, random);
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    const inStrip = p.z >= strip.minZ && p.z <= strip.maxZ && p.z - safeZ >= SPAWNER.quietNearSafe;
    if (
      inStrip &&
      d >= SPAWNER.minDistance - 1e-9 &&
      d <= SPAWNER.maxDistance + 1e-9 &&
      !blocked(p.x, p.z)
    )
      return p;
  }
  return null;
}
