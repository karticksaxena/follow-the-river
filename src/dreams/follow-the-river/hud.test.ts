import { describe, expect, it } from 'vitest';
import { batteryCells, hearts } from './hud';

describe('batteryCells', () => {
  it('shows five cells, rounding up so a nearly-empty battery still shows one', () => {
    expect(batteryCells(100)).toBe('▮▮▮▮▮');
    expect(batteryCells(41)).toBe('▮▮▮▯▯');
    expect(batteryCells(1)).toBe('▮▯▯▯▯');
    expect(batteryCells(0)).toBe('▯▯▯▯▯');
  });
});

describe('hearts', () => {
  it('shows one heart per zombie hit you can still take', () => {
    expect(hearts(100)).toBe('♥♥♥');
    expect(hearts(66)).toBe('♥♥♡');
    expect(hearts(32)).toBe('♥♡♡');
    expect(hearts(0)).toBe('♡♡♡');
  });
});
