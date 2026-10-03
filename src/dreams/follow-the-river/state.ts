export type Phase = 'intro' | 'day1' | 'night1' | 'day2' | 'night2' | 'day3' | 'night3' | 'end';
export const PHASES: readonly Phase[] = [
  'intro',
  'day1',
  'night1',
  'day2',
  'night2',
  'day3',
  'night3',
  'end',
];

export function nextPhase(phase: Phase): Phase {
  return PHASES[Math.min(PHASES.indexOf(phase) + 1, PHASES.length - 1)] ?? 'end';
}

export function isNight(phase: Phase): boolean {
  return phase.startsWith('night');
}

/** 1–3 for day/night phases, 0 for intro and end. */
export function chapterOf(phase: Phase): 0 | 1 | 2 | 3 {
  const n = Number(phase.slice(-1));
  return n === 1 || n === 2 || n === 3 ? n : 0;
}

export interface Supplies {
  battery: number;
  arrows: number;
  ammo: number;
  fishPacks: number;
}
export type SupplyKind = keyof Supplies;

/** What you carry when Mom sends you off. Tuning knobs. */
export const START_SUPPLIES: Readonly<Supplies> = {
  battery: 100,
  arrows: 6,
  ammo: 0,
  fishPacks: 1,
};
export const SUPPLY_LIMITS: Readonly<Supplies> = {
  battery: 100,
  arrows: 20,
  ammo: 24,
  fishPacks: 5,
};

export function addSupply(supplies: Supplies, kind: SupplyKind, amount: number): Supplies {
  const value = Math.max(0, Math.min(SUPPLY_LIMITS[kind], supplies[kind] + amount));
  return { ...supplies, [kind]: value };
}

/** New supplies after spending, or null when there isn't enough. */
export function spend(supplies: Supplies, kind: SupplyKind, amount: number): Supplies | null {
  return supplies[kind] >= amount ? addSupply(supplies, kind, -amount) : null;
}

export interface RunState {
  supplies: Supplies;
  /** Fish packs thrown into the river this chapter (powers that night's strikes). */
  fed: number;
  /** Pickup ids already collected (they never respawn). */
  taken: string[];
  tapes: number[];
  hints: string[];
}

export interface RunSave extends RunState {
  version: 1;
  /** The phase to play next; `supplies` etc. are the checkpoint at its start. */
  phase: Phase;
}

export function freshRun(): RunSave {
  return {
    version: 1,
    phase: 'intro',
    supplies: { ...START_SUPPLIES },
    fed: 0,
    taken: [],
    tapes: [],
    hints: [],
  };
}

const count = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const list = <T>(v: unknown, item: (x: unknown) => x is T): v is T[] =>
  Array.isArray(v) && v.every(item);
const text = (v: unknown): v is string => typeof v === 'string';

function isSupplies(v: unknown): v is Supplies {
  return record(v) && count(v.battery) && count(v.arrows) && count(v.ammo) && count(v.fishPacks);
}

export function isRunSave(value: unknown): value is RunSave {
  if (!record(value) || value.version !== 1) return false;
  return (
    typeof value.phase === 'string' &&
    (PHASES as readonly string[]).includes(value.phase) &&
    isSupplies(value.supplies) &&
    count(value.fed) &&
    list(value.taken, text) &&
    list(value.tapes, count) &&
    list(value.hints, text)
  );
}

/** The live state at the start of `save.phase` (deep copy), keeping hints already seen. */
export function restartPhase(save: RunSave, hintsSeen: readonly string[] = []): RunState {
  return {
    supplies: { ...save.supplies },
    fed: save.fed,
    taken: [...save.taken],
    tapes: [...save.tapes],
    hints: [...new Set([...save.hints, ...hintsSeen])],
  };
}

/** Checkpoint after finishing `save.phase` with `live`. Fish fed by day carries into that night only. */
export function completePhase(save: RunSave, live: RunState): RunSave {
  const phase = nextPhase(save.phase);
  return {
    version: 1,
    phase,
    supplies: { ...live.supplies },
    fed: isNight(phase) ? live.fed : 0,
    taken: [...live.taken],
    tapes: [...live.tapes],
    hints: [...live.hints],
  };
}
