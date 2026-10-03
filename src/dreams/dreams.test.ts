import { describe, expect, it } from 'vitest';
import { loadDream } from './load';
import { DREAMS } from './registry';
import type { DreamInfo, DreamModule } from './types';

const stubDream: DreamModule = { start: async () => undefined, dispose: () => undefined };

function info(load: DreamInfo['load']): DreamInfo {
  return { ...DREAMS[0], load };
}

describe('dream registry', () => {
  it('has unique kebab-case ids', () => {
    const ids = DREAMS.map((dream) => dream.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every dream a title, warnings, intro pages and rules', () => {
    for (const dream of DREAMS) {
      expect(dream.title.length).toBeGreaterThan(0);
      expect(dream.minutes).toBeGreaterThan(0);
      expect(dream.warnings.length).toBeGreaterThan(0);
      expect(dream.intro.length).toBeGreaterThan(0);
      expect(dream.howToPlay.length).toBeGreaterThan(0);
    }
  });
});

describe('loadDream', () => {
  it('returns the dream when its code loads', async () => {
    const result = await loadDream(info(async () => stubDream));
    expect(result).toEqual({ ok: true, dream: stubDream });
  });

  it('turns a failed download into a message naming the dream', async () => {
    const result = await loadDream(info(() => Promise.reject(new Error('offline'))));
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('Follow the River');
  });
});
