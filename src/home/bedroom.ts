import * as THREE from 'three/webgpu';
import { enableShadows, loadModel } from '../engine/models';
import { createSkyDome } from '../engine/sky';

/** Kenney furniture is modelled small; ×2 makes the bed ~2.3 m long and walls ~2.6 m tall. Tuning knob. */
export const FURNITURE_SCALE = 2;
/** Floor tiles are 0.1 m thick after scaling; furniture stands on top. */
const FLOOR_Y = 0.1;
/** Kenney walls are 1.29 tall; scaled, the ceiling sits here. */
const CEILING_Y = 1.29 * FURNITURE_SCALE;
const NIGHT = 0x04060b;

/** [file, x, y, z, rotationY]. Kenney origins sit at a model corner (x ≥ 0, z ≤ 0). */
type Placement = readonly [string, number, number, number, number];

const PIECES: readonly Placement[] = [
  ['floorFull', 0, 0, 0, 0],
  ['floorFull', 2, 0, 0, 0],
  ['floorFull', 4, 0, 0, 0],
  ['floorFull', 0, 0, -2, 0],
  ['floorFull', 2, 0, -2, 0],
  ['floorFull', 4, 0, -2, 0],
  ['wallWindow', 0, 0, -4, 0],
  ['wall', 2, 0, -4, 0],
  ['wall', 4, 0, -4, 0],
  ['wall', 0, 0, 0, Math.PI / 2],
  ['wall', 0, 0, -2, Math.PI / 2],
  ['wall', 6, 0, -2, -Math.PI / 2],
  ['wall', 6, 0, -4, -Math.PI / 2],
  ['wall', 2, 0, 0, Math.PI],
  ['wall', 4, 0, 0, Math.PI],
  ['wall', 6, 0, 0, Math.PI],
  ['bedSingle', -0.6, FLOOR_Y, -1.74, 0],
  ['cabinetBedDrawerTable', 1.45, FLOOR_Y, -3.58, 0],
  ['lampRoundTable', 1.55, FLOOR_Y + 0.52, -3.62, 0],
  ['rugRound', 2.2, FLOOR_Y, -1.0, 0],
  ['books', 2.6, FLOOR_Y, -3.4, 0.3],
];

export interface Bedroom {
  scene: THREE.Scene;
  /** Where the sleeper's head rests; the Zzz rise from here. */
  head: THREE.Vector3;
  view: { position: THREE.Vector3; target: THREE.Vector3 };
}

/** Kartik asleep: a head on the pillow and a blanket-covered body. Simple shapes, no character model. */
function sleeper(head: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 24, 16),
    new THREE.MeshLambertMaterial({ color: 0xc49a7c }),
  );
  face.position.copy(head);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 1.1, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0x2f3d5c }),
  );
  body.rotation.x = Math.PI / 2;
  body.position.set(head.x, head.y - 0.04, head.z + 0.85);
  group.add(face, body);
  enableShadows(group);
  return group;
}

/** Closes the room so no black void shows above the walls. */
function ceiling(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 4),
    new THREE.MeshLambertMaterial({ color: 0x2b2722 }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(3, CEILING_Y, -2);
  return mesh;
}

function lights(scene: THREE.Scene, head: THREE.Vector3): void {
  scene.add(new THREE.HemisphereLight(0x1c2438, 0x050506, 0.25));
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.2);
  moon.position.set(1, 4, -6);
  moon.target.position.copy(head);
  const lamp = new THREE.PointLight(0xffc58a, 2, 5, 2);
  lamp.position.set(1.67, FLOOR_Y + 0.95, -3.74);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.002;
  scene.add(moon, moon.target, lamp);
}

export async function buildBedroom(): Promise<Bedroom> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.Fog(NIGHT, 5, 16);
  const models = await Promise.all(PIECES.map(([file]) => loadModel(`/assets/home/${file}.glb`)));
  models.forEach((model, i) => {
    const [, x, y, z, rotationY] = PIECES[i];
    model.scale.setScalar(FURNITURE_SCALE);
    model.position.set(x, y, z);
    model.rotation.y = rotationY;
    // The lamp holds its own light; letting it cast would black out the room.
    if (PIECES[i][0] === 'lampRoundTable') enableShadows(model, false);
    scene.add(model);
  });
  const head = new THREE.Vector3(0.75, FLOOR_Y + 0.72, -3.55);
  // Night sky outside, seen through the window.
  scene.add(sleeper(head), ceiling(), createSkyDome(0x02030a, 0x101a33, 40));
  lights(scene, head);
  return {
    scene,
    head,
    view: {
      position: new THREE.Vector3(5.1, 1.7, -0.9),
      target: new THREE.Vector3(0.9, 0.9, -3.0),
    },
  };
}
