import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createDawn, DAWN, dawnFades, type Fades } from './dawn';
import { createWorldLights, LIGHTING } from './lighting';

const fades = (k: number): Fades => dawnFades(k, { dome: 0, stars: 0, moon: 0 });

describe('dawnFades', () => {
  it('is continuous across the switch to the physical sky (nothing pops)', () => {
    const [before, after] = [fades(DAWN.moonSets - 1e-4), fades(DAWN.moonSets + 1e-4)];
    expect(Math.abs(before.dome - after.dome)).toBeLessThan(0.01);
    expect(Math.abs(before.stars - after.stars)).toBeLessThan(0.01);
    expect(Math.abs(before.moon - after.moon)).toBeLessThan(0.01);
    expect(after.dome).toBe(1); // the painted dome still covers the physical sky at the switch
    expect(after.stars).toBeGreaterThan(0);
  });

  it('ends with no dome, no stars and no moon, and starts with all of them', () => {
    expect(fades(0)).toEqual({ dome: 1, stars: 1, moon: 1 });
    expect(fades(1)).toEqual({ dome: 0, stars: 0, moon: 0 });
  });

  it('never rises as the dawn goes on', () => {
    let last = fades(0);
    for (let k = 0.01; k <= 1; k += 0.01) {
      const now = fades(k);
      expect(now.dome).toBeLessThanOrEqual(last.dome + 1e-9);
      expect(now.stars).toBeLessThanOrEqual(last.stars + 1e-9);
      last = { ...now };
    }
  });
});

describe('createDawn', () => {
  it('changes the key light colour between two frames 1/60 s apart (no 8-bit steps)', () => {
    const lights = createWorldLights(new THREE.Scene());
    const dawn = createDawn(lights, LIGHTING.night, new THREE.PointLight());
    const at = (t: number): number => {
      dawn.step(t / DAWN.seconds, t);
      return lights.key.color.b + lights.key.color.g;
    };
    for (const t of [3, 8, 11]) expect(at(t + 1 / 60)).not.toBe(at(t));
  });

  it('shows the physical sky after the switch and the moon before it', () => {
    const lights = createWorldLights(new THREE.Scene());
    const dawn = createDawn(lights, LIGHTING.night, new THREE.PointLight());
    dawn.step(0.1, 1.4);
    expect([lights.moon.visible, lights.physical.visible]).toEqual([true, false]);
    dawn.step(0.5, 7);
    expect([lights.moon.visible, lights.physical.visible, lights.disc.visible]).toEqual([
      false,
      true,
      true,
    ]);
  });
});
