import { withTimeout } from '../engine/time';
import type { DreamInfo, DreamModule } from './types';

/** Longest wait for a dream's code or its models before giving up with a message. Tuning knob. */
export const LOAD_TIMEOUT_MS = 20_000;

export type LoadResult = { ok: true; dream: DreamModule } | { ok: false; message: string };

/** Attempts at fetching a dream's code before giving up (a blip on the network, or a dev reload). */
export const LOAD_ATTEMPTS = 2;

/** Loads a dream's code, trying again once. A failed download becomes a message, not a crash. */
export async function loadDream(info: DreamInfo): Promise<LoadResult> {
  for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt++) {
    try {
      return { ok: true, dream: await withTimeout(info.load(), LOAD_TIMEOUT_MS) };
    } catch {
      // try again, then fall through to the message
    }
  }
  return {
    ok: false,
    message: `Couldn't load "${info.title}". Check your internet connection and try again.`,
  };
}
