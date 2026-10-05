import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { lightViewmodel, viewLights, viewLightsFor } from './view-light';

function rig(): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  torch: THREE.SpotLight;
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  lamp: THREE.PointLight;
  flash: THREE.PointLight;
} {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);
  const torch = new THREE.SpotLight();
  camera.add(torch);
  const hemi = new THREE.HemisphereLight();
  const moon = new THREE.DirectionalLight();
  const lamp = new THREE.PointLight();
  lamp.visible = false;
  const flash = new THREE.PointLight();
  camera.add(flash);
  scene.add(hemi, moon, lamp);
  return { scene, camera, torch, hemi, moon, lamp, flash };
}

describe('viewLights', () => {
  it('leaves out the torch and invisible lights, keeps the rest', () => {
    const r = rig();
    const found = viewLights(r.scene, r.camera);
    expect(found).not.toContain(r.torch);
    expect(found).not.toContain(r.lamp);
    expect(found).toEqual(expect.arrayContaining([r.hemi, r.moon, r.flash]));
  });

  it('a spot light elsewhere in the world still lights the viewmodel', () => {
    const r = rig();
    const lampPost = new THREE.SpotLight();
    r.scene.add(lampPost);
    expect(viewLights(r.scene, r.camera)).toContain(lampPost);
  });
});

describe('viewLightsFor', () => {
  it('shares one node per camera and picks up a changed light set on update', () => {
    const r = rig();
    const v = viewLightsFor(r.camera);
    expect(viewLightsFor(r.camera)).toBe(v);
    v.update(1);
    expect(v.node.getLights()).not.toContain(r.torch);
    r.lamp.visible = true;
    v.update(1);
    expect(v.node.getLights()).toContain(r.lamp);
  });
});

describe('lightViewmodel', () => {
  it('gives every mesh a node material on the torch-free light set, sharing copies, leaving the source alone', () => {
    const r = rig();
    const v = viewLightsFor(r.camera);
    const source = new THREE.MeshStandardMaterial({ vertexColors: true });
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BufferGeometry(), source);
    const b = new THREE.Mesh(new THREE.BufferGeometry(), source);
    root.add(a, b);
    lightViewmodel(root, v.node);
    expect(a.material).toMatchObject({
      isNodeMaterial: true,
      lightsNode: v.node,
      vertexColors: true,
    });
    expect(b.material).toBe(a.material);
    expect(source).not.toBe(a.material);
  });
});
