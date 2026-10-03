import { describe, expect, it } from 'vitest';
import { boxAt } from './collide';
import { createBoxGrid } from './grid';

describe('createBoxGrid', () => {
  it('finds boxes near a point and skips far ones', () => {
    const near = boxAt(1, 1, 1, 1);
    const far = boxAt(100, 100, 1, 1);
    const grid = createBoxGrid([near, far]);
    expect(grid.near(0, 0, 1)).toEqual([near]);
  });

  it('returns a big box once even though it spans many cells', () => {
    const river = boxAt(10, -60, 14, 360);
    const grid = createBoxGrid([river]);
    expect(grid.near(4, -60, 30)).toEqual([river]);
  });

  it('works with negative coordinates and an empty grid', () => {
    expect(createBoxGrid([]).near(-50, -50, 5)).toEqual([]);
    const box = boxAt(-41, -77, 2, 2);
    expect(createBoxGrid([box]).near(-40, -76, 0.5)).toEqual([box]);
  });

  it('finds a box whose edge is just inside the query square', () => {
    const box = boxAt(9.5, 0, 1, 1); // spans x 9..10, cell 1 with the default size 8
    expect(createBoxGrid([box]).near(7.9, 0, 1.2)).toEqual([box]);
  });
});
