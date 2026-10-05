import { describe, expect, it } from 'vitest';
import { AT } from './intro-scene';
import { WARM_SPOTS } from './intro-warm';

describe('intro warm spots', () => {
  it('cover the river bank and end in the room, where the intro starts', () => {
    expect(WARM_SPOTS.some((s) => s.x === AT.spawnRiver.x && s.z === AT.spawnRiver.z)).toBe(true);
    const last = WARM_SPOTS[WARM_SPOTS.length - 1];
    expect(last?.x).toBe(AT.spawnRoom.x);
    expect(last?.z).toBe(AT.spawnRoom.z);
  });
});
