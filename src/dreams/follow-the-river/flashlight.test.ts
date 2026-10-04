import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BATTERY, beamLevel, chargeBattery, createFlashlight } from './flashlight';

describe('shadow', () => {
  it('skips the shadow pass while dark and forces one render on the way back on', () => {
    const fl = createFlashlight(new THREE.PerspectiveCamera());
    fl.apply(100, 0);
    expect(fl.light.shadow.autoUpdate).toBe(true);
    fl.on = false;
    fl.apply(100, 0);
    expect(fl.light.shadow.autoUpdate).toBe(false);
    fl.on = true;
    fl.apply(100, 0);
    expect(fl.light.shadow.autoUpdate).toBe(true);
    expect(fl.light.shadow.needsUpdate).toBe(true);
    fl.dispose();
  });
});

describe('battery', () => {
  it('drains only while on and never below zero', () => {
    expect(chargeBattery(50, true, 0, 10)).toBeCloseTo(50 - 10 * BATTERY.drainPerSecond);
    expect(chargeBattery(1, true, 0, 100)).toBe(0);
  });

  it('recharges once it has been off a moment, up to full', () => {
    expect(chargeBattery(50, false, BATTERY.rechargeDelay / 2, 1)).toBe(50);
    expect(chargeBattery(50, false, BATTERY.rechargeDelay, 1)).toBeCloseTo(
      50 + BATTERY.rechargePerSecond,
    );
    expect(chargeBattery(99, false, 10, 10)).toBe(100);
  });

  it('shines fully above the low mark and not at all when empty', () => {
    expect(beamLevel(80, 3.3)).toBe(1);
    expect(beamLevel(0, 3.3)).toBe(0);
  });

  it('stutters when low: sometimes dimmed, never above full', () => {
    const levels = Array.from({ length: 200 }, (_, i) => beamLevel(BATTERY.low / 2, i * 0.05));
    expect(Math.min(...levels)).toBeLessThan(0.6);
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
  });
});
