import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ANATOMY } from './dras-anatomy';
import { shoreFor } from './ending-farewell';
import { SHOTS, shotsFor } from './farewell-shots';
import { STRAND } from './orca-strand';

const X_AXIS = new THREE.Vector3(1, 0, 0);

type Bytes = { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

function isFs(x: unknown): x is { readFileSync(p: string): Bytes } {
  return typeof x === 'object' && x !== null && 'readFileSync' in x;
}

/** The repo has no @types/node: Node's fs through a narrow type. */
async function readGlb(path: string): Promise<ArrayBuffer> {
  // @ts-expect-error no node typings in this project
  const fs: unknown = await import('node:fs');
  if (!isFs(fs)) throw new Error('no fs');
  const file = fs.readFileSync(path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

/** The skinned orca lying as she does on the shore (the Beached clip plus `STRAND.bend`), in her own space (nose toward -z). */
async function beachedRig(): Promise<THREE.Object3D> {
  const data = await readGlb('public/assets/characters/orca.glb');
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, '');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = gltf.animations.find((a) => a.name === 'Beached');
  if (!clip) throw new Error('no Beached clip');
  mixer.clipAction(clip).play();
  mixer.update(1);
  STRAND.bend.bones.forEach((n, i) => {
    const turn = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -STRAND.bend.angles[i]);
    gltf.scene.getObjectByName(n)?.quaternion.multiply(turn);
  });
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

/** Every skinned vertex of the rig, in her own space. */
function skinOf(scene: THREE.Object3D): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.skeleton.update();
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- SkinnedMesh's geometry is generic in three's typings
    const geo: THREE.BufferGeometry = o.geometry;
    for (let i = 0; i < geo.attributes.position.count; i++) {
      points.push(o.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(o.matrixWorld));
    }
  });
  return points;
}

/** Her flank's half width in her own space at `ahead` m from her centre and `up` m above her centre line (the real mesh). */
function flankHalf(skin: THREE.Vector3[], ahead: number, up: number): number {
  const near = skin.filter((p) => Math.abs(-p.z - ahead) < 0.3 && Math.abs(p.y - up) < 0.08);
  expect(near.length).toBeGreaterThan(5);
  return Math.max(...near.map((p) => Math.abs(p.x)));
}

describe('the hands on her skin (the real mesh, not the ellipse)', () => {
  const at = shoreFor({ x: -3, z: -387.5 }, -392);
  const shots = shotsFor(at);
  /** Her real half width at the world point `p` of the shots (on her -x side), as the shots frame it. */
  const sideOf = (p: readonly number[]): number => at.noseX - (p[0] ?? 0);

  it("lies on her flank within 3 cm: the skin at the hand beat is where the shots put Kartik's hand", async () => {
    const half = flankHalf(skinOf(await beachedRig()), SHOTS.flank.ahead, SHOTS.flank.up);
    expect(Math.abs(sideOf(shots.hand) + SHOTS.flank.press - half)).toBeLessThan(0.03);
    expect(half).toBeLessThan(ANATOMY.halfWidth + 0.001);
  });

  it("puts Mom's wrist on her skin too, within 4 cm of it, beside yours", async () => {
    const half = flankHalf(
      skinOf(await beachedRig()),
      SHOTS.flank.ahead + SHOTS.momHand.gap,
      SHOTS.flank.up,
    );
    expect(Math.abs(sideOf(shots.momHand) - half)).toBeLessThan(0.04);
  });
});

describe('her arch is smooth (no "broken bones" crease) and her head end is low', () => {
  it('turns under 26 degrees from her neck to the tip of her tail, no joint more than 6', async () => {
    const scene = await beachedRig();
    const q = STRAND.bend.bones.map((n) =>
      (scene.getObjectByName(n) ?? new THREE.Object3D()).getWorldQuaternion(new THREE.Quaternion()),
    );
    const first = q[0];
    const last = q[q.length - 1];
    expect(first && last && first.angleTo(last)).toBeLessThan((26 * Math.PI) / 180);
    for (let i = 1; i < q.length; i++) {
      expect(q[i - 1]?.angleTo(q[i] ?? new THREE.Quaternion())).toBeLessThan((6 * Math.PI) / 180);
    }
  });
});
