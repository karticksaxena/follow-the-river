import { describe, expect, it } from 'vitest';
import { INTERIOR, nearestInteriors, outdoorsAt, type Interior } from './interiors';

const shed: Interior = { minX: -3, maxX: 3, minZ: -5, maxZ: 5, top: 3.25, doorX: 3, doorZ: 0 };
const at = (x: number, z: number): Interior => ({
  ...shed,
  minX: x - 3,
  maxX: x + 3,
  minZ: z - 5,
  maxZ: z + 5,
});

describe('outdoorsAt', () => {
  it('is 1 far outside and just outside an outer wall face', () => {
    expect(outdoorsAt([shed], 50, 1, 50)).toBe(1);
    expect(outdoorsAt([shed], -3.1, 1, 0)).toBe(1);
    expect(outdoorsAt([shed], -2.9, 1, 0)).toBeGreaterThan(0.95); // the outer face itself stays lit
  });
  it('is nearly black at the back, brighter at the door, 1 above the roof', () => {
    const back = outdoorsAt([shed], -2, 1, 0);
    expect(back).toBeCloseTo(INTERIOR.floor, 3);
    expect(outdoorsAt([shed], 2.5, 1, 0)).toBeGreaterThan(back); // a little daylight at the doorway
    expect(outdoorsAt([shed], 2.5, 1, 0)).toBeLessThanOrEqual(INTERIOR.doorLight);
    expect(outdoorsAt([shed], -2, 4, 0)).toBe(1);
  });
  it('darkens the inner wall faces as much as the middle (shack.ts slabs span 0.17-0.37 m in)', () => {
    // Kartik: "the zombie is black, but the room walls are still visible" - the old feather left them at 40%.
    expect(outdoorsAt([shed], -3 + 0.37, 1, 0)).toBeCloseTo(INTERIOR.floor, 3);
    expect(outdoorsAt([shed], -3 + 0.17, 1, 0)).toBeGreaterThan(0.95);
  });
});

describe('nearestInteriors', () => {
  const list = [0, 1, 2, 3, 4, 5].map((i) => at(i * 10, 0));
  it('picks the four closest of six, closest first', () => {
    const out = nearestInteriors(list, 31, 0, []);
    expect(out.map((b) => (b.minX + b.maxX) / 2)).toEqual([30, 40, 20, 50]);
  });
  it('reuses the array it is given', () => {
    const out: Interior[] = [];
    for (let i = 0; i < 5; i++) expect(nearestInteriors(list, i * 10, 0, out)).toBe(out);
    expect(out).toHaveLength(INTERIOR.slots);
  });
});
