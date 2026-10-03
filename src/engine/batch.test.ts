import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { addBatched } from './batch';

function prop(x: number, material: THREE.Material, z = 0): THREE.Object3D {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  root.position.set(x, 0, z);
  root.scale.setScalar(2);
  return root;
}

function meshes(scene: THREE.Scene): THREE.Mesh[] {
  return scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
}

describe('addBatched', () => {
  it('merges props sharing a look into one mesh baked to world space', () => {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshLambertMaterial();
    mat.userData.cached = true;
    addBatched(scene, [prop(0, mat), prop(10, mat), prop(20, mat)]);
    const [out] = meshes(scene);
    expect(meshes(scene)).toHaveLength(1);
    out.geometry.computeBoundingBox();
    expect(out.geometry.boundingBox?.min.x).toBeCloseTo(-1);
    expect(out.geometry.boundingBox?.max.x).toBeCloseTo(21);
    expect(out.material).not.toBe(mat);
    expect(out.material).toHaveProperty('userData', {});
  });

  it('keeps different materials and far-apart cells separate', () => {
    const scene = new THREE.Scene();
    const a = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const b = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
    addBatched(scene, [prop(0, a), prop(1, b), prop(500, a)]);
    expect(meshes(scene)).toHaveLength(3);
  });

  it('leaves the source geometry untouched and adds multi-material roots as they are', () => {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshLambertMaterial();
    const geometry = new THREE.BoxGeometry();
    const source = new THREE.Group().add(new THREE.Mesh(geometry, mat));
    const multi = new THREE.Mesh(new THREE.BoxGeometry(), [mat, mat]);
    addBatched(scene, [source, multi]);
    expect(geometry.boundingBox).toBeNull();
    expect(scene.children).toContain(multi);
  });
});
