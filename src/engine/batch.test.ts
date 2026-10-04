import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { addBatched, mergeParts } from './batch';

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

describe('addBatched cells and layers', () => {
  it('a bigger cell merges a long row into one mesh; layers keep looks apart', () => {
    const mat = new THREE.MeshLambertMaterial();
    const far = [0, 50, 100, 150, 200].map((z) => prop(0, mat, z));
    const small = new THREE.Scene();
    addBatched(small, far);
    expect(meshes(small).length).toBeGreaterThan(1); // default 48 m cells
    const big = new THREE.Scene();
    addBatched(
      big,
      [0, 50, 100, 150, 200].map((z) => prop(0, mat, z)),
      512,
    );
    expect(meshes(big)).toHaveLength(1);
    const layered = new THREE.Scene();
    const a = prop(0, mat);
    const b = prop(1, mat);
    b.traverse((n) => n.layers.set(3));
    addBatched(layered, [a, b], 512);
    expect(
      meshes(layered)
        .map((m) => m.layers.mask)
        .toSorted((p, q) => p - q),
    ).toEqual([1, 8]);
  });
});

describe('mergeParts', () => {
  it('turns a multi-part, multi-material template into one mesh per material, in local space', () => {
    const [m1, m2] = [new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial({ color: 1 })];
    const root = new THREE.Group();
    for (const [x, m] of [
      [0, m1],
      [1, m1],
      [2, m2],
      [3, m2],
    ] as const) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(), m);
      part.position.x = x;
      root.add(part);
    }
    const out = mergeParts(root);
    const parts = out.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(parts).toHaveLength(2);
    const first = parts[0];
    first.geometry.computeBoundingBox();
    expect(first.geometry.boundingBox?.max.x).toBeCloseTo(1.5);
    expect(out.clone(true).children[0]).toHaveProperty('geometry', first.geometry); // clones share it
  });
});
