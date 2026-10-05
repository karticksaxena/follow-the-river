import { describe, expect, it } from 'vitest';
import { damNightLights } from './dam-lights';

describe('damNightLights', () => {
  it('is one dim mesh: 3 windows and 8 lamps, no lights', () => {
    const mesh = damNightLights();
    expect(mesh.geometry.getAttribute('position').count).toBe((3 + 8) * 4);
    const color = mesh.geometry.getAttribute('color');
    for (let i = 0; i < color.array.length; i++) expect(color.array[i]).toBeLessThan(0.6);
    expect(mesh.children).toHaveLength(0);
    expect(mesh.material).toMatchObject({ fog: false });
  });
});
