import { describe, expect, it } from 'vitest';
import { runUpdaters, type Updater } from './updaters';

const broken: Updater = () => {
  throw new Error('boom');
};

describe('runUpdaters', () => {
  it('runs every updater with the frame time', () => {
    const seen: number[] = [];
    const updaters = new Set<Updater>([(dt) => seen.push(dt), (dt) => seen.push(dt * 2)]);
    runUpdaters(updaters, 0.5, () => undefined);
    expect(seen).toEqual([0.5, 1]);
  });

  it('keeps the frame going when one updater throws, then drops and reports it', () => {
    const reported: unknown[] = [];
    let after = 0;
    const updaters = new Set<Updater>([broken, () => after++]);
    runUpdaters(updaters, 0.016, (error) => reported.push(error));
    runUpdaters(updaters, 0.016, (error) => reported.push(error));
    expect(after).toBe(2);
    expect(updaters.has(broken)).toBe(false);
    expect(reported).toHaveLength(1);
  });
});
