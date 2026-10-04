import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { disposeScene } from './dispose';
import { markCached } from './models';

function mesh(): THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial> {
  const material = new THREE.MeshLambertMaterial({ map: new THREE.Texture() });
  return new THREE.Mesh(new THREE.BoxGeometry(), material);
}

describe('disposeScene', () => {
  it('frees geometry, materials and textures the scene owns', () => {
    const scene = new THREE.Scene();
    const owned = mesh();
    scene.add(owned);
    const map = owned.material.map;
    if (!map) throw new Error('expected a texture');
    const spies = [owned.geometry, owned.material, map].map((x) => vi.spyOn(x, 'dispose'));
    disposeScene(scene);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('leaves cached model data alone (shared by every clone)', () => {
    const scene = new THREE.Scene();
    const cached = mesh();
    markCached(cached);
    scene.add(cached.clone());
    const map = cached.material.map;
    if (!map) throw new Error('expected a texture');
    const spies = [cached.geometry, cached.material, map].map((x) => vi.spyOn(x, 'dispose'));
    disposeScene(scene);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('frees light shadow maps', () => {
    const scene = new THREE.Scene();
    const lamp = new THREE.SpotLight();
    lamp.castShadow = true;
    scene.add(lamp);
    const spy = vi.spyOn(lamp.shadow, 'dispose');
    disposeScene(scene);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("frees each skinned clone's skeleton (its bone texture) once", () => {
    const scene = new THREE.Scene();
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    const a = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    const b = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    a.bind(skeleton);
    b.bind(skeleton);
    scene.add(bone, a, b);
    const spy = vi.spyOn(skeleton, 'dispose');
    disposeScene(scene);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('frees a material shared by two meshes only once', () => {
    const scene = new THREE.Scene();
    const a = mesh();
    const b = new THREE.Mesh(new THREE.BoxGeometry(), a.material);
    scene.add(a, b);
    const spy = vi.spyOn(a.material, 'dispose');
    disposeScene(scene);
    expect(spy).toHaveBeenCalledOnce();
  });
});
