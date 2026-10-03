import { describe, expect, it } from 'vitest';
import { isDesktop, type MediaQuery } from './device';

const media =
  (matching: string[]): MediaQuery =>
  (query) => ({ matches: matching.includes(query) });

describe('isDesktop', () => {
  it('accepts a mouse or trackpad', () => {
    expect(isDesktop(media(['(pointer: fine)', '(hover: hover)']))).toBe(true);
  });

  it('rejects a touch-only phone or tablet', () => {
    expect(isDesktop(media(['(pointer: coarse)', '(hover: none)']))).toBe(false);
  });
});
