import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../engine/collide';
import { DOOR_HEIGHT, SHACK_TILE, shackBounds, shackColliders } from './shack';

const def = { id: 's1', x: -14, z: -20, width: 3, depth: 2 };

describe('shack', () => {
  it('has a footprint of width × depth tiles centred on (x, z)', () => {
    const b = shackBounds(def);
    expect(b.maxX - b.minX).toBeCloseTo(2 * SHACK_TILE); // depth runs along x (door faces +X)
    expect(b.maxZ - b.minZ).toBeCloseTo(3 * SHACK_TILE);
  });

  it('lets the player walk in through the doorway on the +X side', () => {
    const b = shackBounds(def);
    const walls = shackColliders(def);
    // Walk from outside the door straight in along -X.
    let x = b.maxX + 1;
    for (let i = 0; i < 40; i++) ({ x } = resolveCircle(x - 0.1, def.z, 0.3, walls));
    expect(x).toBeLessThan(b.maxX - 0.5);
  });

  it('blocks walking through a side wall', () => {
    const b = shackBounds(def);
    const walls = shackColliders(def);
    let z = b.maxZ + 1;
    for (let i = 0; i < 40; i++) ({ z } = resolveCircle(def.x, z - 0.1, 0.3, walls));
    expect(z).toBeGreaterThan(b.maxZ);
  });

  it('has a doorway tall enough to walk through', () => {
    expect(DOOR_HEIGHT).toBeGreaterThanOrEqual(2);
  });
});
