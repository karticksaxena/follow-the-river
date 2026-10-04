import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BATTERY, beamLevel, chargeBattery, createFlashlight, torchAim } from './flashlight';

const EYE = 1.6;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Illuminance at `point` (world, camera at height EYE) the way three lights it: spot cone + penumbra, cutoff distance, decay. */
function lux(point: THREE.Vector3, normal: THREE.Vector3): number {
  const { light } = createFlashlight(new THREE.PerspectiveCamera());
  const from = light.position.clone().add(new THREE.Vector3(0, EYE, 0));
  const axis = light.target.position
    .clone()
    .add(new THREE.Vector3(0, EYE, 0))
    .sub(from)
    .normalize();
  const toPoint = point.clone().sub(from);
  const d = toPoint.length();
  toPoint.divideScalar(d);
  const cone = smoothstep(
    Math.cos(light.angle),
    Math.cos(light.angle * (1 - light.penumbra)),
    axis.dot(toPoint),
  );
  const window = Math.max(0, 1 - (d / light.distance) ** 4) ** 2;
  const reach = window / Math.max(d ** light.decay, 0.01);
  return light.intensity * cone * reach * Math.max(0, normal.dot(toPoint.negate()));
}

const UP = new THREE.Vector3(0, 1, 0);
const ground = (d: number): number => lux(new THREE.Vector3(0, 0, -d), UP);

describe('aim', () => {
  it('points a few degrees below the view, so the pool lies 3-12 m ahead on the ground', () => {
    const { light } = createFlashlight(new THREE.PerspectiveCamera());
    const to = torchAim(new THREE.Vector3());
    const down = Math.atan2(light.position.y - to.y, -(to.z - light.position.z));
    expect(down).toBeGreaterThan(0.1);
    expect(down).toBeLessThan(0.3);
    const hit = (EYE + light.position.y) / Math.tan(down);
    expect(hit).toBeGreaterThan(3);
    expect(hit).toBeLessThan(12);
  });
  it('lights the ground 8 m ahead (inside the cone) at least 0.15x as hard as 3 m ahead', () => {
    expect(ground(8) / ground(3)).toBeGreaterThan(0.15);
  });
  it('lights the whole pool 3-12 m ahead, and fades out past the reach', () => {
    for (const d of [3, 6, 9, 12]) expect(ground(d)).toBeGreaterThan(0.3);
    expect(ground(30)).toBe(0);
  });
  it('is no brighter at 0.5 m on the wall than the old torch (80 cd, decay 2) was', () => {
    const wall = lux(new THREE.Vector3(-0.2, EYE - 0.12 - 0.1, -0.5), new THREE.Vector3(0, 0, 1));
    expect(wall).toBeLessThan(80 / 0.25);
  });
});

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
