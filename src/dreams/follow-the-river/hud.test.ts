import { describe, expect, it } from 'vitest';
import { batteryCells, gunBits, hearts, torchText, waveText } from './hud';

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
    expect(hearts(100, 34)).toBe('♥♥♥');
    expect(hearts(66, 34)).toBe('♥♥♡');
    expect(hearts(32, 34)).toBe('♥♡♡');
    expect(hearts(0, 34)).toBe('♡♡♡');
    expect(hearts(100, 50)).toBe('♥♥');
    expect(hearts(50, 50)).toBe('♥♡');
    expect(hearts(100, 25)).toBe('♥♥♥♥');
  });
});

describe('hud text', () => {
  it('shows the wave being fought, the torch with its spares, and the guns you own as bits', () => {
    expect(waveText(2, 3)).toBe('Wave 2 of 3');
    expect(waveText(0, 3)).toBe('');
    expect(torchText(100, 2)).toBe('🔦 ▮▮▮▮▮ +2');
    expect(torchText(30, 0)).toBe('🔦 ▮▮▯▯▯');
    expect(gunBits([])).toBe(0);
    expect(gunBits(['rifle'])).toBe(4);
    expect(gunBits(['pistol', 'shotgun'])).toBe(3);
  });
});
