import type { AudioBus } from '../engine/audio';
import type { KeyState } from '../engine/input';
import type { Player } from '../engine/player';
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
  read: (pages: readonly string[], onDone?: () => void) => void;
  /** Player-paced question with buttons; resolves with the chosen index. Pauses the game. */
  choose: (text: string, labels: readonly string[]) => Promise<number>;
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
