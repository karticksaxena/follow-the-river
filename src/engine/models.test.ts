import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { enableShadows, litFrom, makeLit, MATTE, matteHuman } from './models';

/** A material as the Quaternius GLBs ship it: shiny half-metal. */
function shiny(name: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.27, metalness: 0.4 });
  m.name = name;
  return m;
}

describe('matteHuman', () => {
  it('makes human materials matte, skin and hair a little smoother', () => {
    const cases: [string, number][] = [
      ['Skin', MATTE.skin],
      ['Hair_Brown', MATTE.hair],
      ['Red', MATTE.other],
    ];
    for (const [name, rough] of cases) {
      const m = shiny(name);
      matteHuman(m);
      expect(m.metalness).toBe(0);
      expect(m.roughness).toBe(rough);
    }
  });

  it("leaves Dras's orca-* materials alone", () => {
    const m = shiny('orca-skin');
    matteHuman(m);
    expect(m.metalness).toBe(0.4);
    expect(m.roughness).toBe(0.27);
  });
});

describe('litFrom', () => {
  it('turns an unlit material into a lit one with the same colour and name', () => {
    const unlit = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    unlit.name = 'carpet';
    const lit = litFrom(unlit);
    if (!(lit instanceof THREE.MeshStandardMaterial)) throw new Error('expected Standard');
    expect(lit.color.getHex()).toBe(0xff0000);
    expect(lit.name).toBe('carpet');
    expect([lit.roughness, lit.metalness]).toEqual([0.85, 0]);
  });

  it('leaves lit materials alone', () => {
    const standard = new THREE.MeshStandardMaterial();
    expect(litFrom(standard)).toBe(standard);
  });

  it('converts every mesh in a model', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    makeLit(root);
    const mesh = root.children[0];
    if (!(mesh instanceof THREE.Mesh)) throw new Error('expected a mesh');
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });
});

describe('enableShadows', () => {
  it('makes meshes cast and receive shadows', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    root.add(mesh);
    enableShadows(root);
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true]);
  });

  it('can make meshes receive only (for a lamp that holds its own light)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    enableShadows(mesh, false);
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, true]);
  });
});
