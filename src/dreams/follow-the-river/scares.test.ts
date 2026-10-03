import { describe, expect, it } from 'vitest';
import { triggered } from './scares';

describe('triggered', () => {
  it('fires watcher and alarm scares by distance', () => {
    expect(triggered({ kind: 'watcher', x: 0, z: -40, trigger: 12 }, 0, -30)).toBe(true);
    expect(triggered({ kind: 'alarm', x: -4, z: -66, trigger: 4 }, 0, -50)).toBe(false);
  });

  it('never fires an ambush by distance (the tape sets it off)', () => {
    expect(triggered({ kind: 'ambush', shack: 's3', trigger: 1.5 }, 0, 0)).toBe(false);
  });
});
