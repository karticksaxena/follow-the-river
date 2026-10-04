import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { enableShadows, litFrom, makeLit } from './models';

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
