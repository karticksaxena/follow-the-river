import type * as THREE from 'three/webgpu';
import type { SaveStore } from '../../engine/save';
import type { PickupDef } from './areas/types';
import { strikesFor, styleFor } from './fish';
import { MAX_HEALTH, phaseTitle, spawnFor, waitQuestion } from './flow';
import { HINTS, type HintId } from './hints';
import { applyLighting, LIGHTING, setFogFar } from './lighting';
import { SICKNESS } from './orca-sick';
import type { Run, Systems } from './run';
import { shackAt } from './scares';
import {
  chapterOf,
  clearWave,
  completePhase,
  isNight,
  restartPhase,
  topUp,
  type RunSave,
  type StoredRun,
} from './state';
import { playTape } from './tapes';
import { newWaveState, waveCrates } from './waves';
import { DAY_TUNING } from './zombies/brain';

/** Lantern brightness at night (tuning knob); it is 0 by day. */
const LANTERN_NIGHT = 6;

/** What the phase functions share: the built systems, the live run and the save. */
export interface Flow {
  sys: Systems;
  lantern: THREE.PointLight;
  run: Run;
  save: RunSave;
  store: SaveStore<StoredRun>;
  onDone: (save: RunSave) => void;
  /** Called at every phase start (resets the per-phase gameplay state). */
  onReset: () => void;
  disposed: boolean;
}

/** The hint's pages if it has not been shown this run (and marks it seen), else none. */
export function hintPages(f: Flow, id: HintId): readonly string[] {
  if (f.run.live.hints.includes(id)) return [];
  f.run.live.hints.push(id);
  return HINTS[id];
}

/** Shows a hint now, unless the player is already reading something. */
export function showHint(f: Flow, id: HintId): void {
  const pages = f.sys.ctx.isPaused() ? [] : hintPages(f, id);
  if (pages.length > 0) f.sys.ctx.read(pages);
}

/** The tape: the `tape` hint the first time, then the transcript with Mom's voice, then the shack's ambush. */
export function readTape(f: Flow, pickup: PickupDef): void {
  const { sys } = f;
  const shack = shackAt(sys.area.shacks, pickup.x, pickup.z);
  const play = (): void =>
    playTape(sys.ctx, pickup.tape ?? 0, () => {
      if (shack && !f.disposed) sys.scares.tapeTaken(shack);
    });
  const hint = hintPages(f, 'tape');
  if (hint.length > 0) sys.ctx.read(hint, play);
  else play();
}

/** (Re)starts `f.save.phase` with the supplies the save holds. */
export function beginPhase(f: Flow): void {
  const { sys, run, save } = f;
  const { horde, bow, fish, pickups, ctx, area } = sys;
  const night = isNight(save.phase);
  run.phase = save.phase;
  run.live = restartPhase(save, run.live.hints);
  run.taken = new Set(run.live.taken);
  run.health = MAX_HEALTH;
  run.dim = 0;
  run.appliedDim = 0;
  run.frozen = false;
  run.dying = 'no';
  run.cutscene = false; // a death or quit mid-cinematic must not leave the run without weapons or controls
  ctx.cinematic(false);
  sys.hud.prompt(null); // the day's "E: wait for dark" must not hang over the night's pages
  applyLighting(sys.world.lights, night ? LIGHTING.night : LIGHTING.day);
  if (night && sys.area.nightFog) setFogFar(sys.world.lights, sys.area.nightFog);
  f.lantern.intensity = night ? LANTERN_NIGHT : 0;
  horde.reset();
  bow.reset();
  fish.reset();
  sys.world.railing?.reset();
  sys.scares.reset();
  if (night) fish.arm(strikesFor(run.live.fed), styleFor(run.live.fed));
  const cleared = night ? save.wave : 0;
  run.waves = newWaveState(cleared);
  run.interact = null;
  fish.setSickness(SICKNESS[save.phase]);
  sys.gates.set(cleared);
  run.pickups = night ? waveCrates(area) : area.pickups;
  pickups.place(run.pickups, run.taken);
  if (!night) for (const l of area.lurkers) horde.spawn(l.x, l.z, l.yaw, DAY_TUNING, l.lying);
  sys.flashlight.on = night;
  const at = spawnFor(save.phase, area, cleared);
  ctx.player.teleport(at.x, at.z, at.yaw);
  sys.world.lights.sky.position.set(at.x, 0, at.z); // the dome follows the player; paused frames skip that
  f.onReset();
}

/** Days 2 and 3 name their place on the title card (Day 1 stays plain). */
const DAY_CARD: Readonly<Record<string, string>> = {
  day2: 'Day 2 - The suburbs',
  day3: 'Day 3 - The forest',
};

/** First-time hints for a phase: the generic one, then the night's own (Night 2, Night 3). */
function phaseHints(f: Flow): string[] {
  const { phase } = f.save;
  if (!isNight(phase)) return [...hintPages(f, 'pickup')];
  const own = chapterOf(phase) === 2 ? 'night2' : chapterOf(phase) === 3 ? 'night3' : null;
  return [...hintPages(f, 'night'), ...(own ? hintPages(f, own) : [])];
}

/** The title card (optional), then the phase's first-time hints. */
export function announce(f: Flow, title: boolean): void {
  const phase = f.save.phase;
  const pages = [...(title ? [DAY_CARD[phase] ?? phaseTitle(phase)] : []), ...phaseHints(f)];
  if (pages.length > 0) f.sys.ctx.read(pages);
}

/** Asks, then saves the day, fades to black, starts the night and fades back in. */
export async function waitForDark(f: Flow): Promise<void> {
  const { ctx, area } = f.sys;
  const tapeLeft = area.pickups.some((p) => p.kind === 'tape' && !f.run.taken.has(p.id));
  const question = waitQuestion(f.run.live.supplies.fishPacks, tapeLeft);
  const pick = await ctx.choose(question, ['Wait', 'Not yet'], 1); // Enter must not pick the irreversible one
  if (f.disposed || pick !== 0) return;
  f.run.frozen = true;
  f.save = completePhase(f.save, f.run.live);
  f.store.save(f.save);
  await ctx.overlay.fade(true);
  if (f.disposed) return;
  beginPhase(f);
  f.run.frozen = true;
  await ctx.overlay.fade(false);
  if (f.disposed) return;
  f.run.frozen = false;
  announce(f, true);
}

/** The night is survived: save and hand over. */
export function arrive(f: Flow): void {
  if (f.run.frozen) return;
  f.run.frozen = true;
  f.save = completePhase(f.save, f.run.live);
  f.store.save(f.save);
  f.onDone(f.save);
}

/** After the death pages: start again at the checkpoint (the wave you died in), never empty-handed. */
export function restart(f: Flow): void {
  if (f.disposed) return;
  beginPhase(f);
  const { live } = f.run;
  live.supplies = topUp(live.supplies, live.guns);
  announce(f, false);
}

/** A wave is dead: the barricade is falling, so save here (a death restarts at this point). */
export function checkpoint(f: Flow, cleared: number): void {
  if (f.run.frozen || f.run.dying !== 'no') return;
  f.save = clearWave(f.save, f.run.live, cleared);
  f.store.save(f.save);
  showHint(f, 'clear');
}
