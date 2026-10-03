import type { Box } from './collide';

/** Bucket size in metres. Tuning knob: about the size of a shack. */
const CELL = 8;
/** Cell coordinates stay well inside ±2^15, so two of them pack into one number key. */
const OFFSET = 32768;
const EMPTY: readonly Box[] = [];

const key = (ix: number, iz: number): number => (ix + OFFSET) * 65536 + (iz + OFFSET);

export interface BoxGrid {
  /** Boxes whose cells touch the square around (x, z). Reused array: read it, don't keep it. */
  near(x: number, z: number, radius: number): readonly Box[];
}

/** Spatial hash so collision checks only look at nearby boxes, not the whole level. */
export function createBoxGrid(boxes: readonly Box[], cell = CELL): BoxGrid {
  const cells = new Map<number, Box[]>();
  for (const box of boxes) {
    for (let ix = Math.floor(box.minX / cell); ix <= Math.floor(box.maxX / cell); ix++) {
      for (let iz = Math.floor(box.minZ / cell); iz <= Math.floor(box.maxZ / cell); iz++) {
        const k = key(ix, iz);
        const list = cells.get(k);
        if (list) list.push(box);
        else cells.set(k, [box]);
      }
    }
  }
  const out: Box[] = [];
  const seen = new Set<Box>();
  return {
    near(x, z, radius) {
      out.length = 0;
      seen.clear();
      for (let ix = Math.floor((x - radius) / cell); ix <= Math.floor((x + radius) / cell); ix++) {
        for (
          let iz = Math.floor((z - radius) / cell);
          iz <= Math.floor((z + radius) / cell);
          iz++
        ) {
          for (const box of cells.get(key(ix, iz)) ?? EMPTY) {
            if (seen.has(box)) continue;
            seen.add(box);
            out.push(box);
          }
        }
      }
      return out;
    },
  };
}
