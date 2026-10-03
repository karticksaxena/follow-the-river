import { describe, expect, it } from 'vitest';
import { shouldStrike, WATCHER } from './watcher';

const SPAWN = { x: 0, z: 0 };

describe('watcher', () => {
  it('waits while the player is far away', () => {
    expect(shouldStrike('waiting', WATCHER.trigger + 1)).toBe(false);
  });

  it('strikes once the player comes within reach', () => {
    expect(shouldStrike('waiting', WATCHER.trigger - 1)).toBe(true);
  });

  it('never strikes twice', () => {
    expect(shouldStrike('struck', 0)).toBe(false);
  });

  it('starts out of reach of the spawn point', () => {
    const distance = Math.hypot(WATCHER.x - SPAWN.x, WATCHER.z - SPAWN.z);
    expect(shouldStrike('waiting', distance)).toBe(false);
  });
});
