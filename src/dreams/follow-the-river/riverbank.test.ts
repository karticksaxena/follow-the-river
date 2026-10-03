import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../engine/collide';
import { PLAYER_RADIUS } from '../../engine/player';
import { riverbankColliders, SPAWN } from './riverbank';

describe('riverbank', () => {
  it('spawns the player in open ground, not inside a collider', () => {
    expect(resolveCircle(SPAWN.x, SPAWN.z, PLAYER_RADIUS, riverbankColliders())).toEqual({
      x: SPAWN.x,
      z: SPAWN.z,
    });
  });

  it('keeps the player out of the river', () => {
    const out = resolveCircle(5, -10, PLAYER_RADIUS, riverbankColliders());
    expect(out.x).toBeLessThan(5);
  });
});
