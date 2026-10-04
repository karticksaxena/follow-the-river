import { describe, expect, it } from 'vitest';
import { disposeOwned } from './post';

describe('disposeOwned', () => {
  it('disposes everything the old graph owned exactly once', () => {
    const counts = [0, 0, 0];
    const owned = counts.map((_, i) => ({
      dispose: () => {
        counts[i]++;
      },
    }));
    disposeOwned(owned);
    disposeOwned(owned);
    expect(counts).toEqual([1, 1, 1]);
    expect(owned).toHaveLength(0);
  });
});
