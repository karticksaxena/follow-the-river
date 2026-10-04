import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { blowAt, mistColor, SICK, SICKNESS } from './orca-sick';
import { PHASES } from './state';

describe('the orca gets sicker', () => {
  it('never gets better as the story goes on, and is dying at the end', () => {
    const steps = PHASES.map((p) => SICKNESS[p]);
    for (let i = 1; i < steps.length; i++)
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] ?? 0);
    expect(SICKNESS.end).toBe(1);
  });

  it('breathes a pale mist when well and a red one when sick', () => {
    const c = new THREE.Color();
    expect(mistColor(0, c).getHex()).toBe(SICK.mist.well);
    expect(mistColor(1, c).getHex()).toBe(SICK.mist.sick);
  });

  it('blows a puff that rises, grows and fades, then is gone', () => {
    const b = { rise: 0, size: 0, opacity: 0 };
    expect(blowAt(0.1, b)).toBe(true);
    const early = { ...b };
    expect(blowAt(SICK.blow.seconds * 0.8, b)).toBe(true);
    expect(b.rise).toBeGreaterThan(early.rise);
    expect(b.opacity).toBeLessThan(early.opacity);
    expect(blowAt(SICK.blow.seconds, b)).toBe(false);
  });
});
