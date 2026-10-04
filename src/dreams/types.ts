import type { AudioBus } from '../engine/audio';
import type { GradePreset } from '../engine/grade';
import type { KeyState } from '../engine/input';
import type { PageHooks } from '../engine/menus';
import type { Player } from '../engine/player';
import type { Difficulty } from '../engine/settings';
import type { Stage } from '../engine/stage';
import type { Overlay } from '../engine/ui';

/** What the home screen shows on a dream's card, plus how to load it. */
export interface DreamInfo {
  id: string;
  title: string;
  minutes: number;
  warnings: readonly string[];
  /** Player-paced pages shown before play (goal, then controls). */
  intro: readonly string[];
  /** Every rule, listed in the pause menu's "How to play". */
  howToPlay: readonly string[];
  load: () => Promise<DreamModule>;
}

/** Everything a running dream may use. The app shell owns the player and pause menu. */
export interface DreamContext {
  stage: Stage;
  overlay: Overlay;
  audio: AudioBus;
  keys: KeyState;
  player: Player;
  /** True while the pause menu or a page is open. Dreams freeze their logic then. */
  isPaused: () => boolean;
  /** Show player-paced pages (pauses the game until the player finishes reading). */
  read: (pages: readonly string[], onDone?: () => void, hooks?: PageHooks) => void;
  /** Player-paced question with buttons; resolves with the chosen index. `focus` is the button Enter picks (default 0). Pauses the game. */
  choose: (text: string, labels: readonly string[], focus?: number) => Promise<number>;
  /** Freeze input (no pause menu) until the next `read`/`choose` closes; for scene swaps. */
  hold: () => void;
  /** A cinematic owns the player: input off (the pause menu still opens on Esc) / back on. */
  cinematic: (on: boolean) => void;
  /** Depth of field for cutscenes: on at `distance` metres, off. The first `on` compiles it, so warm it behind a black fade. */
  focus: (on: boolean, distance?: number) => void;
  /** Colour grade for the scene, blended over `seconds` (0 = cut); returns the preset it left. */
  grade: (preset: GradePreset, seconds?: number) => GradePreset;
  /** The player's difficulty (read it when a wave or phase starts; the pause menu can change it). */
  difficulty: () => Difficulty;
  setDifficulty: (d: Difficulty) => void;
  /** End the dream and return to the dream cards (fades out first). */
  finish: () => void;
}

export interface DreamModule {
  /**
   * Build the world: set `ctx.stage.scene`, colliders and spawn. If `dispose()` is called
   * while this is still loading (a timeout), it must not touch the stage afterwards.
   */
  start(ctx: DreamContext): Promise<void>;
  /** Called once the intro pages are finished (the game is about to run). */
  begin?(): void;
  dispose(): void;
}
