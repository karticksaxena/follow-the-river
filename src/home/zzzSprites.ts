import * as THREE from 'three/webgpu';
import { ZZZ, zzzFrame } from './zzz';

function letterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    g.font = 'bold 52px Georgia, serif';
    g.fillStyle = '#cfd8ff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Z', 32, 34);
  }
  return new THREE.CanvasTexture(canvas);
}

export interface ZzzEmitter {
  update(dt: number): void;
  dispose(): void;
}

/** Spawns a Z above `origin` every ZZZ.every seconds; each one rises, sways and fades. */
export function createZzz(scene: THREE.Scene, origin: THREE.Vector3): ZzzEmitter {
  const texture = letterTexture();
  const live: { sprite: THREE.Sprite; age: number }[] = [];
  let clock: number = ZZZ.every;
  return {
    update(dt) {
      clock += dt;
      if (clock >= ZZZ.every) {
        clock = 0;
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          fog: false,
        });
        const sprite = new THREE.Sprite(material);
        scene.add(sprite);
        live.push({ sprite, age: 0 });
      }
      for (const z of live) {
        z.age += dt;
        const f = zzzFrame(z.age / ZZZ.lifetime);
        z.sprite.position.set(origin.x + f.sway, origin.y + 0.15 + f.rise, origin.z);
        z.sprite.scale.setScalar(f.scale);
        z.sprite.material.opacity = f.opacity;
      }
      while (live.length > 0 && live[0].age >= ZZZ.lifetime) {
        const dead = live.shift();
        dead?.sprite.removeFromParent();
        dead?.sprite.material.dispose();
      }
    },
    dispose() {
      for (const z of live) {
        z.sprite.removeFromParent();
        z.sprite.material.dispose();
      }
      live.length = 0;
      texture.dispose();
    },
  };
}
