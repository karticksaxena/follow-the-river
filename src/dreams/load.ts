import type { DreamInfo, DreamModule } from './types';

export type LoadResult = { ok: true; dream: DreamModule } | { ok: false; message: string };

/** Loads a dream's code. A failed download becomes a message instead of a crash. */
export async function loadDream(info: DreamInfo): Promise<LoadResult> {
  try {
    return { ok: true, dream: await info.load() };
  } catch {
    return {
      ok: false,
      message: `Couldn't load "${info.title}". Check your internet connection and try again.`,
    };
  }
}
