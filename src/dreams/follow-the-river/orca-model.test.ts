import { describe, expect, it } from 'vitest';
import glb from '../../../public/assets/characters/orca.glb?raw';
import { ANATOMY } from './dras-anatomy';

/** The GLB's JSON chunk (ASCII, right after the 20-byte header; the binary chunk follows it). */
function chunk(raw: string): Record<string, unknown> {
  const end = raw.lastIndexOf('}', raw.indexOf('BIN\0', 20));
  const j: unknown = JSON.parse(raw.slice(20, end + 1));
  if (typeof j !== 'object' || j === null) throw new Error('not a glTF');
  return Object.fromEntries(Object.entries(j));
}

/** The `name` of each entry of the glTF array `key` (materials, nodes, animations). */
function names(j: Record<string, unknown>, key: string): string[] {
  const list = j[key];
  if (!Array.isArray(list)) return [];
  return list.flatMap((e: unknown) =>
    typeof e === 'object' && e !== null && 'name' in e && typeof e.name === 'string'
      ? [e.name]
      : [],
  );
}

describe('Dras model', () => {
  const j = chunk(glb);
  it('has her materials, bones and clips', () => {
    expect(names(j, 'materials').toSorted()).toEqual([
      'orca-black',
      'orca-eye',
      'orca-grey',
      'orca-mouth',
      'orca-white',
    ]);
    const bones = names(j, 'nodes');
    for (const b of ['Head', 'Jaw', 'Spine1', 'Spine5', 'Tail1', 'Tail2'])
      expect(bones).toContain(b);
    expect(names(j, 'animations').toSorted()).toEqual([
      'Beached',
      'Exhale',
      'Lunge',
      'Swim',
      'TailLift',
    ]);
  });
  it('was measured', () => {
    expect(ANATOMY.length).toBe(7);
    expect(ANATOMY.halfLength).toBe(3.5);
    expect(ANATOMY.halfWidth).toBeGreaterThan(0.4);
    expect(ANATOMY.finHeight).toBeGreaterThan(0.7);
    expect(ANATOMY.finHeight).toBeLessThan(1.1);
    expect(ANATOMY.eye.side).toBeGreaterThan(0.2);
    expect(ANATOMY.bite.ahead).toBeGreaterThan(2.5);
    expect(ANATOMY.jawOpen).toBeGreaterThan(0.3);
  });
});
