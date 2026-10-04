import { describe, expect, it } from 'vitest';
import glb from '../../public/assets/home/ceilingFan.glb?raw';
import { FAN_SPIN, spunAngle } from './fan';

/** The `name` of every node in the GLB's JSON chunk (ASCII, right after the 20-byte header). */
function nodeNames(raw: string): string[] {
  const end = raw.lastIndexOf('}', raw.indexOf('BIN\0', 20));
  const json: unknown = JSON.parse(raw.slice(20, end + 1));
  if (typeof json !== 'object' || json === null || !('nodes' in json)) return [];
  const { nodes } = json;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((n: unknown) =>
    typeof n === 'object' && n !== null && 'name' in n && typeof n.name === 'string'
      ? [n.name]
      : [],
  );
}

describe('spunAngle', () => {
  it('after n frames equals FAN_SPIN × elapsed', () => {
    let angle = 0;
    for (let i = 0; i < 60; i++) angle = spunAngle(angle, 1 / 60);
    expect(angle).toBeCloseTo(FAN_SPIN);
  });

  it('is frame-rate independent', () => {
    let slow = 0;
    let fast = 0;
    for (let i = 0; i < 10; i++) slow = spunAngle(slow, 0.1);
    for (let i = 0; i < 100; i++) fast = spunAngle(fast, 0.01);
    expect(slow).toBeCloseTo(fast);
  });

  it('wraps into [0, 2π)', () => {
    const angle = spunAngle(6.2, 10);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(Math.PI * 2);
  });
});

describe('ceiling fan model', () => {
  it('has the Blades node the game spins, and a fixture', () => {
    const names = nodeNames(glb);
    expect(names).toContain('Blades');
    expect(names).toContain('Fixture');
  });
});
