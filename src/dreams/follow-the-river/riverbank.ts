import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { enableShadows } from '../../engine/models';
import { createSkyDome } from '../../engine/sky';
import { addSkyline } from './skyline';

/** Overcast dusk: dark grey-blue. Never bright. */
export const SKY = 0x1b2026;
export const RIVER_X = 7;
export const RIVER_WIDTH = 8;
export const BANK_LENGTH = 120;

/** Grey-box crates: [x, z, size]. Placeholder props until Plan 2's city kit. */
export const CRATES: ReadonlyArray<readonly [number, number, number]> = [
  [-2, -6, 1.2],
  [1.5, -11, 1],
  [-3.5, -17, 1.6],
  [0.5, -24, 1.1],
  [-1.5, -32, 1.4],
];

export const SPAWN = { x: 0, z: 0, yaw: 0 } as const;

/** Crates, the river (no swimming yet) and the edges of the walkable strip. */
export function riverbankColliders(): Box[] {
  const crates = CRATES.map(([x, z, size]) => boxAt(x, z, size, size));
  const middle = -BANK_LENGTH / 2 + 10;
  return [
    ...crates,
    boxAt(RIVER_X, middle, RIVER_WIDTH, BANK_LENGTH),
    boxAt(-8, middle, 2, BANK_LENGTH),
    boxAt(0, 11, 24, 2),
    boxAt(0, -BANK_LENGTH + 9, 24, 2),
  ];
}

function plane(width: number, depth: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export async function buildRiverbank(): Promise<THREE.Scene> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 6, 70);
  scene.add(createSkyDome(0x07090c, SKY), new THREE.HemisphereLight(0x5a6470, 0x15180f, 0.6));
  const middle = -BANK_LENGTH / 2 + 10;
  // Ground and water run far past the walkable strip so fog, not an edge, ends the view.
  const ground = plane(120, 360, 0x2b2f24);
  ground.position.set(RIVER_X - RIVER_WIDTH / 2 - 60, 0, middle);
  const farBank = plane(80, 360, 0x24271f);
  farBank.position.set(RIVER_X + RIVER_WIDTH / 2 + 40, 0, middle);
  const water = plane(RIVER_WIDTH, 360, 0x0b161b);
  water.position.set(RIVER_X, -0.15, middle);
  for (const surface of [ground, farBank, water]) surface.receiveShadow = true;
  scene.add(ground, farBank, water);
  await addSkyline(scene);
  const crateMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3b2a });
  for (const [x, z, size] of CRATES) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMaterial);
    crate.position.set(x, size / 2, z);
    enableShadows(crate);
    scene.add(crate);
  }
  return scene;
}
