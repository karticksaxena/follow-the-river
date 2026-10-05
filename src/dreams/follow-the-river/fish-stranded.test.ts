import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { afterLift, liftTail, TAIL_LIFT_WEIGHT } from './fish-farewell';
import type { FishState } from './fish-state';
import { sag, unsag } from './fish-strand';
import { STRAND } from './orca-strand';

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

interface Rig {
  mixer: THREE.AnimationMixer;
  actions: Record<'swim' | 'lunge' | 'settled' | 'lift', THREE.AnimationAction>;
  tail: THREE.Object3D;
  bones: THREE.Object3D[];
  scene: THREE.Object3D;
}

/** The orca as she lands: Swim -> Lunge -> Beached, the same fades as fish-strand.ts. */
async function strandedRig(): Promise<Rig> {
  const data = await readGlb('public/assets/characters/orca.glb');
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, '');
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = (name: string): THREE.AnimationAction => {
    const c = gltf.animations.find((a) => a.name === name);
    if (!c) throw new Error(`no ${name}`);
    return mixer.clipAction(c);
  };
  const actions = {
    swim: clip('Swim'),
    lunge: clip('Lunge'),
    settled: clip('Beached'),
    lift: clip('TailLift'),
  };
  for (const once of [actions.lunge, actions.lift]) {
    once.setLoop(THREE.LoopOnce, 1);
    once.clampWhenFinished = true;
  }
  actions.swim.play();
  actions.lunge.reset().play();
  actions.lunge.crossFadeFrom(actions.swim, 0.25, false);
  mixer.update(1);
  actions.settled.reset().play();
  actions.settled.crossFadeFrom(actions.lunge, 0.5, false);
  mixer.update(1);
  const named = (n: string): THREE.Object3D => {
    const o = gltf.scene.getObjectByName(n);
    if (!o) throw new Error(`no ${n}`);
    return o;
  };
  return {
    mixer,
    actions,
    tail: named('Tail2'),
    bones: STRAND.bend.bones.map(named),
    scene: gltf.scene,
  };
}

describe('Dras stranded, on the real clips', () => {
  it('only Beached (and a TailLift at most TAIL_LIFT_WEIGHT) has weight; her sag does not pile up', async () => {
    const { mixer, actions, tail, bones, scene } = await strandedRig();
    const f = {
      ...actions,
      sagBones: bones,
      sagK: 0,
      end: { exhaled: -1 },
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stub with the fields these functions read
    } as unknown as FishState;
    mixer.addEventListener('finished', (e) => {
      if (e.action === actions.lift) afterLift(f);
    });
    const pos = new THREE.Vector3();
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 60 * 30; i++) {
      if (i % 360 === 120) liftTail(f);
      unsag(f); // as fish.ts does before the mixer
      mixer.update(1 / 60);
      sag(f, 1); // fully bent, as when she is down
      scene.updateMatrixWorld(true);
      tail.getWorldPosition(pos);
      lo = Math.min(lo, pos.y);
      hi = Math.max(hi, pos.y);
      expect(actions.swim.getEffectiveWeight()).toBe(0);
      expect(actions.lunge.getEffectiveWeight()).toBe(0);
      expect(actions.settled.getEffectiveWeight()).toBe(1);
      const liftWeight = actions.lift.isScheduled() ? actions.lift.getEffectiveWeight() : 0;
      expect(liftWeight).toBeLessThanOrEqual(TAIL_LIFT_WEIGHT);
    }
    expect(hi - lo).toBeLessThan(0.5); // before: the tail beat up and down by metres
  });
});
