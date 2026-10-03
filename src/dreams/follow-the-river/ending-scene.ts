import * as THREE from 'three/webgpu';
import { loadSkinned } from '../../engine/models';
import { createMom, type Mom } from './intro-scene';
import { characterUrl } from './kits';
import type { Systems } from './run';

/** Tuning knobs. Mom's lantern is the chapter's boathouse lantern, moved to her hand. */
export const MOM_LANTERN = { intensity: 5, distance: 28, height: 1.3 } as const;
/** The control house's door (see tools/blender/plan3_props.py): its face sits on the crest's edge. */
const DOOR = { x: 13.5, z: 0.7, crest: 18 } as const;
const LANTERN_SIZE = { width: 0.14, height: 0.24 } as const;
const LANTERN_COLOR = 0xffb060;

/** Where Mom stands (world): in front of the dam's control-house door, on the crest. Dam yaw is 0. */
export function momSpot(dam: { x: number; z: number }): { x: number; y: number; z: number } {
  return { x: dam.x - DOOR.x, y: DOOR.crest, z: dam.z - DOOR.z };
}

/** The yaw that points a model's +Z from `(x, z)` toward `(toX, toZ)`. */
export function facing(x: number, z: number, toX: number, toZ: number): number {
  return Math.atan2(toX - x, toZ - z);
}

export interface EndingScene {
  mom: Mom;
  /** Puts Mom at the door facing `(toX, toZ)` and lights the lantern in her hand. */
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

/** Mom (loaded now, while the screen is black) with the lantern in her hand, parked until `place`. */
export async function buildEndingScene(sys: Systems): Promise<EndingScene> {
  const dam = sys.area.safeProp;
  if (!dam) throw new Error('the ending needs the dam as the safe prop');
  const spot = momSpot(dam);
  const mom = createMom(await loadSkinned(characterUrl('mom')), makeLantern());
  mom.group.visible = false;
  sys.world.scene.add(mom.group);
  const home = new THREE.Vector3();
  return {
    mom,
    place(toX, toZ, lantern) {
      mom.group.position.set(spot.x, spot.y, spot.z);
      mom.group.rotation.y = facing(spot.x, spot.z, toX, toZ);
      mom.pack.visible = true;
      mom.group.visible = true;
      home.copy(lantern.position);
      lantern.position.set(spot.x, spot.y + MOM_LANTERN.height, spot.z + 0.4);
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
