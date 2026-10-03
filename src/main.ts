import * as THREE from 'three/webgpu';
import { createStage } from './engine/stage';
import './style.css';

// Temporary (Task 2): proves the stage renders. Task 11 replaces this file.
async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('index.html needs #app');
  const stage = await createStage(root);
  document.documentElement.dataset.backend = stage.backend;
  stage.scene.background = new THREE.Color(0x101418);
  stage.scene.fog = new THREE.Fog(0x101418, 2, 12);
  stage.scene.add(new THREE.HemisphereLight(0x8899aa, 0x223311, 0.6));
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshLambertMaterial({ color: 0x884422 }),
  );
  cube.position.set(0, 0.5, -3);
  stage.scene.add(cube);
  stage.camera.position.set(0, 1.6, 0);
  stage.addUpdater((dt) => {
    cube.rotation.y += dt;
  });
}

void boot();
