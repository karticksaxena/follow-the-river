import type { BoxGrid } from '../../engine/grid';
import type { DreamContext } from '../types';
import type { Ambience } from './ambience';
import type { AreaDef, PickupDef } from './areas/types';
import type { Bow } from './bow';
import type { Fish } from './fish';
import type { Flashlight } from './flashlight';
import type { Armory } from './gun';
import type { HintId } from './hints';
import type { Hud } from './hud';
import type { PickupMeshes } from './pickups';
import type { Scares } from './scares';
import type { Sounds } from './sounds';
import type { Phase, RunState } from './state';
import type { Gates, WaveState } from './waves';
import type { World } from './world';
import type { Horde } from './zombies/horde';

/** Everything the chapter built once and the per-frame update drives. */
export interface Systems {
  ctx: DreamContext;
  area: AreaDef;
  world: World;
  grid: BoxGrid;
  sounds: Sounds;
  horde: Horde;
  flashlight: Flashlight;
  bow: Bow;
  armory: Armory;
  fish: Fish;
  pickups: PickupMeshes;
  hud: Hud;
  ambience: Ambience;
  scares: Scares;
  /** The night's barricades, one per wave. */
  gates: Gates;
}

export type Dying = 'no' | 'anim' | 'wait';
/** The finale: `fight` is the last wave (no normal spawns), `calm` is after it (wind only). */
export type EndingState = 'no' | 'fight' | 'calm';

/** Mutable state of the phase being played (reset by the chapter at every phase start). */
export interface Run {
  phase: Phase;
  live: RunState;
  /** Ids in `live.taken`, as a set for the per-frame pickup search. */
  taken: Set<string>;
  /** What can be picked up this phase: the area's by day, the wave crates by night. */
  pickups: readonly PickupDef[];
  /** The night's waves (unused by day). */
  waves: WaveState;
  /** A scripted E action (the ending's farewell), offered when within `radius` m of `at`. */
  interact: Interact | null;
  health: number;
  /** Shack darkness 0..1 and the value last applied to the lights. */
  dim: number;
  appliedDim: number;
  time: number;
  /** True while the chapter is between phases or finished: gameplay does not tick. */
  frozen: boolean;
  dying: Dying;
  dyingTime: number;
  ending: EndingState;
}

export interface Interact {
  at: { x: number; z: number };
  radius: number;
  prompt: string;
  use: () => void;
}

/** What gameplay asks the chapter to do. */
export interface Events {
  hint(id: HintId): void;
  /** The player took a tape: read it with its voice, then the shack's ambush (if any). */
  tape(pickup: PickupDef): void;
  wait(): void;
  die(): void;
  arrive(): void;
  /** Night 3: the player reached the foot of the dam. */
  ending(): void;
  /** A wave is dead: save the checkpoint (`cleared` waves behind you). */
  checkpoint(cleared: number): void;
}
