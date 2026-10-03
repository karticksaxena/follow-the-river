import * as THREE from 'three/webgpu';
import { loadSkinned } from '../../engine/models';
import { createMom, type Mom } from './intro-scene';
import { characterUrl } from './kits';
import type { Systems } from './run';

/** Tuning knobs. Mom's lantern is the chapter's lantern, beside her on the pebbles. */
export const MOM_LANTERN = { intensity: 5, distance: 28, height: 1.3 } as const;
const LANTERN_SIZE = { width: 0.14, height: 0.24 } as const;
const LANTERN_COLOR = 0xffb060;

/** The yaw that points a model's +Z from `(x, z)` toward `(toX, toZ)`. */
export function facing(x: number, z: number, toX: number, toZ: number): number {
  return Math.atan2(toX - x, toZ - z);
}

export interface EndingScene {
  mom: Mom;
  /** Puts Mom on the shore facing `(toX, toZ)` and lights the lantern in her hand. */
  place(toX: number, toZ: number, lantern: THREE.PointLight): void;
  /** Hides Mom and gives the lantern back where it was. */
  remove(lantern: THREE.PointLight): void;
  dispose(): void;
}

function makeLantern(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(LANTERN_SIZE.width, LANTERN_SIZE.height, LANTERN_SIZE.width),
    new THREE.MeshBasicMaterial({ color: LANTERN_COLOR, fog: false }),
  );
}

/** Mom (loaded now, while the screen is black) with the lantern beside her, parked until `place`. */
export async function buildEndingScene(sys: Systems): Promise<EndingScene> {
  const spot = sys.area.meetAt;
  if (!spot) throw new Error('the ending needs a meeting spot (meetAt)');
  const mom = createMom(await loadSkinned(characterUrl('mom')), makeLantern());
  mom.group.visible = false;
  sys.world.scene.add(mom.group);
  const home = new THREE.Vector3();
  return {
    mom,
    place(toX, toZ, lantern) {
      mom.group.position.set(spot.x, 0, spot.z);
      mom.group.rotation.y = facing(spot.x, spot.z, toX, toZ);
      mom.pack.visible = true;
      mom.group.visible = true;
      home.copy(lantern.position);
      lantern.position.set(spot.x + 0.5, MOM_LANTERN.height, spot.z);
      lantern.distance = MOM_LANTERN.distance;
      lantern.intensity = MOM_LANTERN.intensity;
    },
    remove(lantern) {
      mom.group.visible = false;
      lantern.position.copy(home);
    },
    dispose: () => mom.dispose(),
  };
}
