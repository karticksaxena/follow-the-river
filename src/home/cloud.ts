import * as THREE from 'three/webgpu';
import type { Stage } from '../engine/stage';

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

function puffTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

/** A ring of soft violet puffs: the "dream cloud" the camera rises into. */
export function addDreamCloud(scene: THREE.Scene, center: THREE.Vector3): THREE.Group {
  const cloud = new THREE.Group();
  const material = new THREE.SpriteMaterial({
    map: puffTexture(),
    color: 0x6d5fa8,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    fog: false,
  });
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const puff = new THREE.Sprite(material);
    puff.position.set(
      center.x + Math.cos(angle) * 2.2,
      center.y + Math.sin(i * 1.7) * 0.6,
      center.z + Math.sin(angle) * 2.2,
    );
    puff.scale.setScalar(2.2 + (i % 3) * 0.6);
    cloud.add(puff);
  }
  scene.add(cloud);
  return cloud;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Glides the camera between two poses over `seconds`, easing in and out. */
export function tweenCamera(
  stage: Stage,
  from: CameraPose,
  to: CameraPose,
  seconds: number,
): Promise<void> {
  const target = new THREE.Vector3();
  let elapsed = 0;
  return new Promise((resolve) => {
    const stop = stage.addUpdater((dt) => {
      elapsed += dt;
      const t = easeInOutCubic(elapsed / seconds);
      stage.camera.position.lerpVectors(from.position, to.position, t);
      stage.camera.lookAt(target.lerpVectors(from.target, to.target, t));
      if (elapsed < seconds) return;
      stop();
      resolve();
    });
  });
}
