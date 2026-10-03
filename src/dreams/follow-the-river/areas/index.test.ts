import { describe, expect, it } from 'vitest';
import { PHASES } from '../state';
import { areaFor } from './index';

describe('areaFor', () => {
  it('routes each day and night to its area, and intro/end to none', () => {
    const ids = PHASES.map((p) => areaFor(p)?.id ?? null);
    expect(ids).toEqual([null, 'city', 'city', 'suburbs', 'suburbs', 'forest', 'forest', null]);
  });
});
