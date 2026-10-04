import * as THREE from 'three/webgpu';
import { loadSkinned } from '../../engine/models';
import { createCharacter, type Character } from './intro-scene';
import { characterUrl } from './kits';
import { lookAt, reach } from './rig';

/** DEV only (chapter.ts wires it behind `import.meta.env.DEV`): `window.kdRig`, see the A10 report. */
export interface DevRig {
  who: Record<'kartik' | 'mom', Character | undefined>;
  /** Puts Kartik (left) and Mom (right) 3 m ahead of the camera, facing it, and starts a rAF loop. */
  load(): Promise<void>;
  /** `play('kartik', 'Sit')` cross-fades to a clip (no `CharacterArmature|` prefix). */
  play(who: 'kartik' | 'mom', clip: string, once?: boolean): void;
  clips(who: 'kartik' | 'mom'): string[];
  /** Head follows the camera, within 70 deg yaw / 40 deg pitch. `look(false)` stops. */
  look(on?: boolean): void;
  /** Kartik's right hand to a world point (default 0.3 m ahead of and below the camera). */
  reach(target?: THREE.Vector3): void;
  /** Steps both mixers by hand (a hidden tab pauses rAF). */
  step(dt: number): void;
  dispose(): void;
}

const LIMITS = { yaw: 1.2, pitch: 0.7 };

export function createDevRig(scene: THREE.Scene, camera: THREE.Camera): DevRig {
  const who: DevRig['who'] = { kartik: undefined, mom: undefined };
  const assets = new Map<string, { clips: readonly THREE.AnimationClip[] }>();
  let raf = 0;
  let looking = false;
  let reachTo: THREE.Vector3 | null = null;
  let last = 0;
  const target = new THREE.Vector3();
  const pole = new THREE.Vector3();

  const step = (dt: number): void => {
    for (const c of Object.values(who)) c?.update(dt);
    const k = who.kartik;
    if (!k) return;
    if (looking) lookAt(k.bone('Head'), camera.getWorldPosition(target), 1, LIMITS);
    if (reachTo) {
      k.group.localToWorld(pole.set(0.6, 1.2, -0.8)); // out to his right and behind: the elbow bends there
      reach(k.bone('UpperArmR'), k.bone('LowerArmR'), k.bone('WristR'), reachTo, pole);
    }
  };
  const loop = (t: number): void => {
    step(Math.min((t - last) / 1000, 0.1));
    last = t;
    raf = requestAnimationFrame(loop);
  };
  return {
    who,
    async load() {
      const fwd = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const base = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 3);
      base.y = 0;
      for (const [name, side] of [
        ['kartik', -0.8],
        ['mom', 0.8],
      ] as const) {
        const asset = await loadSkinned(characterUrl(name));
        assets.set(name, asset);
        who[name]?.group.removeFromParent();
        const c = createCharacter(asset);
        c.group.position.copy(base).addScaledVector(right, side);
        c.group.rotation.y = Math.atan2(-fwd.x, -fwd.z); // faces the camera
        scene.add(c.group);
        who[name] = c;
      }
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    },
    play: (name, clip, once) => who[name]?.play(clip, once),
    clips: (name) =>
      (assets.get(name)?.clips ?? []).map((c) => c.name.replace('CharacterArmature|', '')),
    look(on = true) {
      looking = on;
    },
    reach(to) {
      reachTo = to ?? camera.localToWorld(new THREE.Vector3(0.15, -0.3, -0.3));
    },
    step,
    dispose() {
      cancelAnimationFrame(raf);
      for (const c of Object.values(who)) {
        c?.group.removeFromParent();
        c?.dispose();
      }
    },
  };
}
