import { withTimeout } from '../engine/time';
import type { DreamInfo, DreamModule } from './types';

/** Longest wait for a dream's code or its models before giving up with a message. Tuning knob. */
export const LOAD_TIMEOUT_MS = 20_000;

export type LoadResult = { ok: true; dream: DreamModule } | { ok: false; message: string };

/** Loads a dream's code. A failed download becomes a message instead of a crash. */
export async function loadDream(info: DreamInfo): Promise<LoadResult> {
  try {
    return { ok: true, dream: await withTimeout(info.load(), LOAD_TIMEOUT_MS) };
  } catch {
    return {
      ok: false,
      message: `Couldn't load "${info.title}". Check your internet connection and try again.`,
    };
  }
}
