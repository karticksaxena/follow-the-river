import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  addRim,
  bodyHit,
  CLIP_FOR,
  headCentre,
  OUTFITS,
  pickOutfit,
  RIM,
  rimStrength,
  timeScaleFor,
} from './look';

describe('zombie looks', () => {
  it('uses every outfit before repeating one', () => {
    const total = OUTFITS.m.length + OUTFITS.f.length;
    const seen = new Set(Array.from({ length: total }, (_, i) => JSON.stringify(pickOutfit(i))));
    expect(seen.size).toBe(total);
  });

  it('only names real outfits', () => {
    for (let i = 0; i < 40; i++) {
      const { body, outfit } = pickOutfit(i);
      expect(OUTFITS[body]).toContain(outfit);
    }
  });

  it('maps every intent to a clip that exists in the zombie files', () => {
    const clips = ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death', 'GetUp'];
    for (const clip of Object.values(CLIP_FOR)) expect(clips).toContain(clip);
  });

  it('speeds the walk clip up with the zombie so feet do not slide', () => {
    expect(timeScaleFor('Walk', 1.8)).toBeCloseTo(2 * timeScaleFor('Walk', 0.9));
    expect(timeScaleFor('Idle', 3)).toBe(1);
  });

  it('says whether a ray struck the head or the body', () => {
    const dir = { x: 0, y: 0, z: -1 };
    const hunched = { x: 0, y: 1.33, z: 0.3 }; // bone 1.23 m up, 0.3 m forward, raised 0.1
    const hit = (y: number, z = 5): ReturnType<typeof bodyHit> =>
      bodyHit({ x: 0, y, z }, dir, 0, 0, 0, false, hunched);
    expect(hit(1.33)?.head).toBe(true);
    expect(hit(0.8)?.head).toBe(false);
    expect(hit(1.7)).toBeNull();
    const lie = { x: 0, y: 0.25, z: 1.1 };
    expect(bodyHit({ x: 0, y: 0.25, z: 5 }, dir, 0, 0, 0, true, lie)?.head).toBe(true);
  });

  it('headCentre follows the bone, or falls back above the root', () => {
    const bone = new THREE.Object3D();
    bone.matrixWorld.setPosition(1, 1.2, 2);
    expect(headCentre(bone, 0, 0, 0, { x: 0, y: 0, z: 0 })).toEqual({ x: 1, y: 1.3, z: 2 });
    expect(headCentre(null, 4, 1, 5, { x: 0, y: 0, z: 0 })).toEqual({ x: 4, y: 2.6, z: 5 });
  });
});

describe('moon rim', () => {
  it('follows the moon: full at night, none by day, never above the cap', () => {
    expect(rimStrength(1)).toBe(RIM.strength);
    expect(rimStrength(0)).toBe(0);
    expect(rimStrength(0.5)).toBeCloseTo(RIM.strength / 2);
    expect(rimStrength(3)).toBe(RIM.strength);
    expect(RIM.strength).toBeLessThan(0.5); // faint: it must not brighten the scene
  });

  it('rims one shared twin per source material and leaves orca materials alone', () => {
    const skin = new THREE.MeshStandardMaterial({ name: 'skin' });
    const orca = new THREE.MeshStandardMaterial({ name: 'orca-body' });
    const g = new THREE.BufferGeometry();
    const [a, b, c] = [skin, skin, orca].map((m) => new THREE.Mesh(g, m));
    const root = new THREE.Group().add(a, b, c);
    addRim(root);
    expect(a.material).not.toBe(skin);
    expect(a.material).toBe(b.material);
    expect(c.material).toBe(orca);
    const other = new THREE.Mesh(g, skin);
    addRim(other);
    expect(other.material).toBe(a.material);
  });
});
