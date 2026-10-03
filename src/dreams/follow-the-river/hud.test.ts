import { describe, expect, it } from 'vitest';
import { batteryCells } from './hud';

describe('batteryCells', () => {
  it('shows five cells, rounding up so a nearly-empty battery still shows one', () => {
    expect(batteryCells(100)).toBe('▮▮▮▮▮');
    expect(batteryCells(41)).toBe('▮▮▮▯▯');
    expect(batteryCells(1)).toBe('▮▯▯▯▯');
    expect(batteryCells(0)).toBe('▯▯▯▯▯');
  });
});
