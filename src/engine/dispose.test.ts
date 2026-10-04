import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { disposeScene } from './dispose';
import { markCached } from './models';
import { attachKeyShadows } from './shadows';

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

  it('leaves the one geometry three shares between every Sprite', () => {
    const scene = new THREE.Scene();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    scene.add(sprite);
    const geometry = vi.spyOn(sprite.geometry, 'dispose');
    const material = vi.spyOn(sprite.material, 'dispose');
    disposeScene(scene);
    expect(geometry).not.toHaveBeenCalled();
    expect(material).toHaveBeenCalledOnce();
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

  it('survives a dispose that removes later nodes from the graph mid-walk', () => {
    const scene = new THREE.Scene();
    const a = mesh();
    const b = mesh();
    const c = mesh();
    scene.add(a, b, c);
    a.material.addEventListener('dispose', () => scene.remove(b, c));
    const spies = [a, b, c].map((m) => vi.spyOn(m.material, 'dispose'));
    expect(() => disposeScene(scene)).not.toThrow();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('survives key shadows whose CSM detach removes its cascade lights', () => {
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('removeEventListener', vi.fn());
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight();
    attachKeyShadows(key, 'high');
    const csm = key.shadow.shadowNode;
    if (!(csm instanceof CSMShadowNode)) throw new Error('expected a CSM');
    scene.add(key);
    const cascade = new THREE.DirectionalLight(); // the CSM adds these itself on first render
    csm.lights.push(cascade);
    scene.add(cascade, cascade.target);
    const tail = mesh();
    scene.add(tail);
    const spy = vi.spyOn(tail.material, 'dispose');
    expect(() => disposeScene(scene)).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
