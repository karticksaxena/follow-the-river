import { describe, expect, it } from 'vitest';
import { isWarming, setWarmingFlag } from './warming';

describe('warming flag', () => {
  it('follows the stage setter and starts cleared', () => {
    expect(isWarming()).toBe(false);
    setWarmingFlag(true);
    expect(isWarming()).toBe(true);
    setWarmingFlag(false);
    expect(isWarming()).toBe(false);
  });
});
