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

/** The guns you can find, in the order you find them (keys 2–4; the bow is 1). */
export type GunKind = 'pistol' | 'shotgun' | 'rifle';
export const GUN_KINDS: readonly GunKind[] = ['pistol', 'shotgun', 'rifle'];

export interface Supplies {
  /** The torch's charge, 0–100. */
  battery: number;
  /** Spare batteries: R puts one in. */
  cells: number;
  arrows: number;
  /** Pistol bullets. */
  ammo: number;
  /** Shotgun shells. */
  shells: number;
  /** Rifle rounds. */
  rounds: number;
  fishPacks: number;
}
export type SupplyKind = keyof Supplies;

/** Each gun's ammunition. */
export const AMMO_OF: Readonly<Record<GunKind, SupplyKind>> = {
  pistol: 'ammo',
  shotgun: 'shells',
  rifle: 'rounds',
};

/** What you carry when Mom sends you off. Tuning knobs. */
export const START_SUPPLIES: Readonly<Supplies> = {
  battery: 100,
  cells: 0,
  arrows: 6,
  ammo: 0,
  shells: 0,
  rounds: 0,
  fishPacks: 1,
};
export const SUPPLY_LIMITS: Readonly<Supplies> = {
  battery: 100,
  cells: 5,
  arrows: 20,
  ammo: 24,
  shells: 16,
  rounds: 90,
  fishPacks: 5,
};

/** What a death gives back at the least: never restart empty-handed. Tuning knobs. */
export const AFTER_DEATH: Readonly<Supplies> = {
  battery: 60,
  cells: 1,
  arrows: 6,
  ammo: 8,
  shells: 4,
  rounds: 20,
  fishPacks: 1,
};

export function addSupply(supplies: Supplies, kind: SupplyKind, amount: number): Supplies {
  const value = Math.max(0, Math.min(SUPPLY_LIMITS[kind], supplies[kind] + amount));
  return { ...supplies, [kind]: value };
}

/** New supplies after spending, or null when there isn't enough. */
export function spend(supplies: Supplies, kind: SupplyKind, amount: number): Supplies | null {
  return supplies[kind] >= amount ? addSupply(supplies, kind, -amount) : null;
}

/** Supplies raised to AFTER_DEATH (ammo only for the guns you own). */
export function topUp(supplies: Supplies, guns: readonly GunKind[]): Supplies {
  const out = { ...supplies };
  for (const kind of ['battery', 'cells', 'arrows', 'fishPacks'] as const) {
    out[kind] = Math.max(out[kind], AFTER_DEATH[kind]);
  }
  for (const gun of guns) {
    const kind = AMMO_OF[gun];
    out[kind] = Math.max(out[kind], AFTER_DEATH[kind]);
  }
  return out;
}

export interface RunState {
  supplies: Supplies;
  /** Fish packs thrown into the river this chapter (powers that night's strikes). */
  fed: number;
  /** Pickup ids already collected (they never respawn). */
  taken: string[];
  tapes: number[];
  hints: string[];
  /** Guns found so far; they stay for good. */
  guns: GunKind[];
}

export interface RunSave extends RunState {
  version: 2;
  /** The phase to play next; `supplies` etc. are the checkpoint at its start. */
  phase: Phase;
  /** Waves of this night already cleared: the checkpoint is the start of the next one. */
  wave: number;
}

export function freshRun(): RunSave {
  return {
    version: 2,
    phase: 'intro',
    wave: 0,
    supplies: { ...START_SUPPLIES },
    fed: 0,
    taken: [],
    tapes: [],
    hints: [],
    guns: [],
  };
}

const count = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const maybeCount = (v: unknown): boolean => v === undefined || count(v);
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const list = <T>(v: unknown, item: (x: unknown) => x is T): v is T[] =>
  Array.isArray(v) && v.every(item);
const text = (v: unknown): v is string => typeof v === 'string';
const gunKind = (v: unknown): v is GunKind => (GUN_KINDS as readonly unknown[]).includes(v);

/** A save as it may sit on disk: Plans 2–5 wrote version 1 (`hasGun`, four supplies). */
export interface StoredRun extends Omit<RunSave, 'version' | 'guns' | 'wave' | 'supplies'> {
  version: 1 | 2;
  supplies: Partial<Supplies> & Pick<Supplies, 'battery' | 'arrows' | 'ammo' | 'fishPacks'>;
  guns?: GunKind[];
  hasGun?: boolean;
  wave?: number;
}

function isStoredSupplies(v: unknown): v is StoredRun['supplies'] {
  if (!record(v)) return false;
  const known = count(v.battery) && count(v.arrows) && count(v.ammo) && count(v.fishPacks);
  return known && maybeCount(v.cells) && maybeCount(v.shells) && maybeCount(v.rounds);
}

/** A version 1 or 2 save, every field checked (missing newer fields are filled by normalizeSave). */
export function isRunSave(value: unknown): value is StoredRun {
  if (!record(value) || (value.version !== 1 && value.version !== 2)) return false;
  return (
    (value.hasGun === undefined || typeof value.hasGun === 'boolean') &&
    (value.guns === undefined || list(value.guns, gunKind)) &&
    maybeCount(value.wave) &&
    typeof value.phase === 'string' &&
    (PHASES as readonly string[]).includes(value.phase) &&
    isStoredSupplies(value.supplies) &&
    count(value.fed) &&
    list(value.taken, text) &&
    list(value.tapes, count) &&
    list(value.hints, text)
  );
}

/** A version 2 save from any stored one: the old `hasGun` becomes the pistol. */
export function normalizeSave(save: StoredRun): RunSave {
  const { hasGun, ...rest } = save;
  return {
    ...rest,
    version: 2,
    wave: save.wave ?? 0,
    supplies: { ...START_SUPPLIES, cells: 0, ...save.supplies },
    guns: save.guns ?? (hasGun ? ['pistol'] : []),
  };
}

/** The live state at the checkpoint of `save` (deep copy), keeping hints already seen. */
export function restartPhase(save: RunSave, hintsSeen: readonly string[] = []): RunState {
  return {
    supplies: { ...save.supplies },
    fed: save.fed,
    taken: [...save.taken],
    tapes: [...save.tapes],
    hints: [...new Set([...save.hints, ...hintsSeen])],
    guns: [...save.guns],
  };
}

function snapshot(live: RunState, phase: Phase, wave: number, fed: number): RunSave {
  return {
    version: 2,
    phase,
    wave,
    supplies: { ...live.supplies },
    fed,
    taken: [...live.taken],
    tapes: [...live.tapes],
    hints: [...live.hints],
    guns: [...live.guns],
  };
}

/** Checkpoint after finishing `save.phase` with `live`. Fish fed by day carries into that night only. */
export function completePhase(save: RunSave, live: RunState): RunSave {
  const phase = nextPhase(save.phase);
  return snapshot(live, phase, 0, isNight(phase) ? live.fed : 0);
}

/** Checkpoint mid-night: `wave` waves cleared, with what you carry now. */
export function clearWave(save: RunSave, live: RunState, wave: number): RunSave {
  return snapshot(live, save.phase, wave, live.fed);
}
