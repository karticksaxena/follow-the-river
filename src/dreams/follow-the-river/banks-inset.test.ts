import { describe, expect, it } from 'vitest';
import { bankProfile, BED_Y, stripGeometry, waterlineX } from './banks';
import { FAR_EDGE_X, RIVER_X, WATER_Y } from './river';
import { farBankInset, noBend } from './shore-shape';

const FAR_GRASS = 0x0f130d;
const ZS = [100, 96, 92, 88, 84, 80, 76, 72, 68, 64, 60];

/** The unique (x, y) points of one row of a built far strip, ordered from the land to the riverbed. */
function row(z: number): { x: number; y: number }[] {
  const g = stripGeometry(bankProfile('natural', FAR_GRASS), ZS, true, {
    bend: noBend,
    inset: farBankInset,
  });
  const p = g.attributes.position;
  const seen = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getZ(i) - z) < 1e-6) {
      seen.set(`${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)}`, { x: p.getX(i), y: p.getY(i) });
    }
  }
  return [...seen.values()].toSorted((a, b) => b.x - a.x);
}

describe('the far bank pushed in by the wander (A4: water meets the grass, no mud strip, no gap)', () => {
  it('starts level with the land at the far edge and reaches the riverbed', () => {
    for (const z of ZS) {
      const pts = row(z);
      expect(pts[0].x).toBeCloseTo(FAR_EDGE_X, 4);
      expect(pts[0].y).toBe(0);
      expect(pts.at(-1)?.y).toBeCloseTo(BED_Y, 4);
    }
  });

  it('keeps a level lip from the far edge to the shifted bank', () => {
    for (const z of ZS) {
      const push = farBankInset(z);
      const lip = row(z).filter((q) => q.y === 0);
      expect(lip.length).toBe(push > 1e-6 ? 2 : 1);
      expect(Math.min(...lip.map((q) => q.x))).toBeCloseTo(FAR_EDGE_X - push, 4);
    }
  });

  it('meets the water exactly at the shifted water line, with the cut bank all the way down', () => {
    for (const z of ZS) {
      const push = farBankInset(z);
      const pts = row(z);
      let crossing = NaN;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a.y >= WATER_Y && b.y < WATER_Y) {
          crossing = a.x + ((a.y - WATER_Y) / (a.y - b.y)) * (b.x - a.x);
        }
      }
      expect(crossing).toBeCloseTo(2 * RIVER_X - (waterlineX('natural') + push), 4);
      // Every point above the water is on the land side of the water line: no mud strip.
      for (const q of pts.filter((r) => r.y > WATER_Y + 1e-9)) {
        expect(q.x).toBeGreaterThanOrEqual(crossing - 1e-6);
      }
    }
  });
});
