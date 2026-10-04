import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createFilmRoll, FILM_WRIST_ROLL, makePhone, PHONE, rollStep } from './phone';

const HAND = /^(Wrist|Thumb|Index|Middle|Ring|Pinky).*R$/;

type Bytes = { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

function isFs(x: unknown): x is { readFileSync(p: string): Bytes } {
  return typeof x === 'object' && x !== null && 'readFileSync' in x;
}

/** The repo has no @types/node; the test reads the glb with Node's fs through a narrow type. */
async function readGlb(path: string): Promise<ArrayBuffer> {
  // @ts-expect-error no node typings in this project
  const fs: unknown = await import('node:fs');
  if (!isFs(fs)) throw new Error('no fs');
  const file = fs.readFileSync(path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

async function loadMom(): Promise<{ scene: THREE.Object3D; film: THREE.AnimationClip }> {
  const data = await readGlb('public/assets/characters/mom.glb');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(data, '');
  const film = gltf.animations.find((c) => c.name.endsWith('|Film'));
  if (!film) throw new Error('mom.glb has no Film clip');
  return { scene: gltf.scene, film };
}

type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function attr(geo: { getAttribute(name: string): unknown }, name: string): Attr {
  const a = geo.getAttribute(name);
  if (a instanceof THREE.BufferAttribute || a instanceof THREE.InterleavedBufferAttribute) return a;
  throw new Error(`no ${name}`);
}

/** The right hand's skinned vertices (weighted >= 0.5 to its bones), in the wrist's rigid frame. */
function handVertices(scene: THREE.Object3D, toWrist: THREE.Matrix4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  scene.traverse((m) => {
    if (!(m instanceof THREE.SkinnedMesh)) return;
    m.skeleton.update();
    const geo: unknown = m.geometry;
    if (!(geo instanceof THREE.BufferGeometry)) return;
    const skinIndex = attr(geo, 'skinIndex');
    const skinWeight = attr(geo, 'skinWeight');
    const position = attr(geo, 'position');
    for (let i = 0; i < position.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        const name = m.skeleton.bones[skinIndex.getComponent(i, k)]?.name ?? '';
        if (HAND.test(name)) w += skinWeight.getComponent(i, k);
      }
      if (w < 0.5) continue;
      const v = new THREE.Vector3().fromBufferAttribute(position, i);
      m.applyBoneTransform(i, v);
      out.push(v.applyMatrix4(m.matrixWorld).applyMatrix4(toWrist));
    }
  });
  return out;
}

describe('the phone in her hand', () => {
  it('is a small dark slab, hidden until Mom films', () => {
    const phone = makePhone();
    expect(phone.visible).toBe(false);
    const size = new THREE.Box3().setFromObject(phone).getSize(new THREE.Vector3());
    expect(
      size
        .toArray()
        .map((v) => +v.toFixed(3))
        .toSorted((a, b) => a - b),
    ).toEqual([PHONE.d, PHONE.w, PHONE.h].map((v) => +v.toFixed(3)).toSorted((a, b) => a - b));
  });

  it('keeps the wrist roll under the 110 degree limit', () => {
    expect(2 * Math.acos(Math.abs(FILM_WRIST_ROLL.w))).toBeLessThan((110 * Math.PI) / 180);
  });

  it('does not compound when the mixer leaves a static pose alone, and hands the bone back at 0', () => {
    const wrist = new THREE.Object3D();
    wrist.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    const posed = wrist.quaternion.clone();
    const roll = createFilmRoll();
    roll(wrist, 1);
    const once = wrist.quaternion.clone();
    roll(wrist, 1);
    roll(wrist, 1);
    expect(wrist.quaternion.angleTo(once)).toBeLessThan(1e-6);
    expect(once.angleTo(posed)).toBeGreaterThan(1.5); // about 93 degrees
    roll(wrist, 0);
    expect(wrist.quaternion.angleTo(posed)).toBeLessThan(1e-6);
  });

  it('eases the wrist roll in and out', () => {
    let w = rollStep(0, true, 1 / 60);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(0.2); // no snap
    for (let i = 0; i < 30; i++) w = rollStep(w, true, 1 / 60);
    expect(w).toBeGreaterThan(0.95); // in by about half a second
    for (let i = 0; i < 60; i++) w = rollStep(w, false, 1 / 60);
    expect(w).toBeLessThan(0.01);
  });

  it('rests against the palm side without touching any right-hand vertex, at 3 points of the Film clip', async () => {
    const { scene, film } = await loadMom();
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(film).play();
    const wrist = scene.getObjectByName('WristR');
    const head = scene.getObjectByName('Head');
    if (!wrist || !head) throw new Error('no WristR / Head');
    const roll = createFilmRoll();
    const mount = makePhone().children[0];
    if (!mount) throw new Error('no mount');
    mount.updateMatrix();
    const toPhone = mount.matrix.clone().invert(); // wrist frame -> phone frame
    for (const f of [0.25, 0.5, 0.75]) {
      mixer.setTime(film.duration * f);
      roll(wrist, 1); // the wrist turned fully, as while she films
      scene.updateMatrixWorld(true);
      const rigid = wrist.matrixWorld
        .clone()
        .scale(
          new THREE.Vector3(1, 1, 1).divide(
            new THREE.Vector3().setFromMatrixScale(wrist.matrixWorld),
          ),
        );
      const verts = handVertices(scene, rigid.clone().invert());
      expect(verts.length).toBeGreaterThan(500);
      let backGap = Infinity;
      for (const v of verts) {
        const p = v.applyMatrix4(toPhone); // metres, phone frame: Z is the screen normal
        const over = Math.abs(p.x) < PHONE.w / 2 && Math.abs(p.y) < PHONE.h / 2;
        expect(over && Math.abs(p.z) < PHONE.d / 2).toBe(false); // nothing pokes into the slab
        if (over) backGap = Math.min(backGap, -PHONE.d / 2 - p.z);
      }
      expect(backGap).toBeGreaterThan(0.002); // clear of the hand...
      expect(backGap).toBeLessThan(0.008); // ...but resting on it, not floating
      // the screen faces her eyes: its world normal against the line from the phone to her head
      const world = rigid.clone().multiply(mount.matrix);
      const centre = new THREE.Vector3().setFromMatrixPosition(world);
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(world);
      const toHead = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).sub(centre);
      expect(normal.dot(toHead.normalize())).toBeGreaterThan(0.7);
    }
  });
});
