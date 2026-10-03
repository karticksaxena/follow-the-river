import type { BoxGrid } from '../../engine/grid';
import type { DreamContext } from '../types';
import type { Ambience } from './ambience';
import type { AreaDef, PickupDef } from './areas/types';
import type { Bow } from './bow';
import type { Fish } from './fish';
import type { Flashlight } from './flashlight';
import type { Gun } from './gun';
import type { HintId } from './hints';
import type { Hud } from './hud';
import type { PickupMeshes } from './pickups';
import type { Scares } from './scares';
import type { Sounds } from './sounds';
import type { Phase, RunState } from './state';
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
  gun: Gun;
  fish: Fish;
  pickups: PickupMeshes;
  hud: Hud;
  ambience: Ambience;
  scares: Scares;
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
}
