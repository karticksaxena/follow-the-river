import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { nextSurfacing } from './fish-parts';
import { blowAt, dulled, makeSick, mistColor, SICK, sicknessAt } from './orca-sick';
import { PHASES } from './state';

const skinBody = (...names: string[]): THREE.Group => {
  const body = new THREE.Group();
  for (const name of names)
    body.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name })));
  return body;
};

const nodeMaterials = (body: THREE.Object3D): THREE.MeshStandardNodeMaterial[] => {
  const out: THREE.MeshStandardNodeMaterial[] = [];
  body.traverse((n) => {
    if (n instanceof THREE.Mesh && n.material instanceof THREE.MeshStandardNodeMaterial)
      out.push(n.material);
  });
  return out;
};

describe('the orca gets sicker', () => {
  it('starts dimming gently on Day 1 and grows with every zombie eaten, above the story floor', () => {
    expect(sicknessAt('intro', 0)).toBe(0);
    expect(sicknessAt('day1', 0)).toBe(0.05);
    expect(sicknessAt('night1', 10)).toBeCloseTo(0.15);
    expect(sicknessAt('night2', 0)).toBe(0.24);
    expect(sicknessAt('night3', 40)).toBeCloseTo(0.6);
    expect(sicknessAt('night3', 500)).toBe(0.9);
    expect(sicknessAt('end', 0)).toBe(1);
  });

  it('never drops as the story goes on, and is dying at the end', () => {
    const floors = PHASES.map((p) => SICK.floor[p]);
    for (let i = 1; i < floors.length; i++)
      expect(floors[i]).toBeGreaterThanOrEqual(floors[i - 1] ?? 0);
    expect(SICK.floor.end).toBe(1);
  });

  it('her breath stays pale until the very end', () => {
    const c = new THREE.Color();
    expect(mistColor(0.9, c).getHex()).toBe(new THREE.Color(SICK.mist.well).getHex());
    expect(mistColor(1, c).getHex()).toBe(new THREE.Color(SICK.mist.sick).getHex());
    expect(mistColor(1, c).r).toBeGreaterThan(mistColor(1, c).g * 2); // red, not pale
  });

  it('a sick blow is smaller and fainter, and still fades away', () => {
    const a = { rise: 0, size: 0, opacity: 0 };
    const b = { rise: 0, size: 0, opacity: 0 };
    expect(blowAt(0.5, 0, a)).toBe(true);
    blowAt(0.5, 0.9, b);
    expect(b.size).toBeLessThan(a.size);
    expect(b.opacity).toBeLessThan(a.opacity);
    expect(b.rise).toBeLessThan(a.rise);
    expect(blowAt(SICK.blow.seconds, 0.9, b)).toBe(false);
  });

  it('dulls gradually, never jumps: black only darkens to charcoal, white only yellows a little', () => {
    const base = new THREE.Color(0x030303);
    let prev = dulled(base, 0, new THREE.Color()).getHex();
    expect(prev).toBe(0x030303);
    for (let k = 0.05; k <= 1.0001; k += 0.05) {
      const c = dulled(base, k, new THREE.Color());
      expect(c.r).toBeLessThanOrEqual(new THREE.Color(SICK.dullBlack).r + 1e-6);
      expect(Math.abs(c.getHex() - prev)).toBeLessThan(0x080808);
      prev = c.getHex();
    }
    const white = dulled(new THREE.Color(0xe7e9eb), 1, new THREE.Color());
    expect(white.r).toBeGreaterThan(new THREE.Color(0x8a8a8a).r); // still light
  });

  it('dulls the grey saddle between the two, never to black or white', () => {
    const grey = new THREE.Color(0x6f7276);
    const c = dulled(grey, 1, new THREE.Color());
    expect(c.r).toBeGreaterThan(new THREE.Color(SICK.dullBlack).r);
    expect(c.r).toBeLessThan(new THREE.Color(SICK.dullWhite).r);
  });

  it('keeps every material its own base colour (black stays black)', () => {
    const body = new THREE.Group();
    for (const [name, hex] of [
      ['orca-black', 0x030303],
      ['orca-white', 0xe7e9eb],
      ['orca-grey', 0x6f7276],
    ] as const)
      body.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial({ name, color: hex }),
        ),
      );
    const sick = makeSick(body);
    sick.set(0.8);
    expect(sick.k).toBe(0.8);
    const mats = nodeMaterials(body);
    expect(mats.map((m) => m.color.getHex())).toEqual([0x030303, 0xe7e9eb, 0x6f7276]);
    expect(mats.map((m) => m.name)).toEqual(['orca-black', 'orca-white', 'orca-grey']);
    expect(mats.every((m) => m.colorNode !== null && m.positionNode !== null)).toBe(true);
    sick.dispose();
  });

  it('only the skin is painted; eye and mouth keep their look but still waste with her', () => {
    const body = skinBody('orca-eye', 'orca-mouth');
    makeSick(body);
    for (const mat of nodeMaterials(body)) {
      expect(mat.colorNode).toBeNull();
      expect(mat.positionNode).not.toBeNull();
    }
  });

  it('gives each orca its own uniform, so the calf stays healthy', () => {
    const a = makeSick(skinBody('orca-black'));
    const b = makeSick(skinBody('orca-black'));
    a.set(1);
    expect(b.k).toBe(0);
    a.dispose();
    b.dispose();
  });

  it('surfaces more often when sick (logging at the surface)', () => {
    expect(nextSurfacing(0.5, 0.9)).toBeLessThan(nextSurfacing(0.5, 0));
    expect(nextSurfacing(0.5)).toBe(nextSurfacing(0.5, 0));
  });
});
