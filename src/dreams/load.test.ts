import { describe, expect, it } from 'vitest';
import { loadDream } from './load';
import type { DreamInfo, DreamModule } from './types';

const dream: DreamModule = { start: () => Promise.resolve(), dispose: () => undefined };
const info = (load: DreamInfo['load']): DreamInfo => ({
  id: 'test',
  title: 'Test',
  minutes: 1,
  warnings: [],
  intro: [],
  howToPlay: [],
  load,
});

describe('loadDream', () => {
  it('tries a failed download once more before giving up', async () => {
    let calls = 0;
    const result = await loadDream(
      info(() => {
        calls++;
        return calls === 1 ? Promise.reject(new Error('blip')) : Promise.resolve(dream);
      }),
    );
    expect(result).toEqual({ ok: true, dream });
    expect(calls).toBe(2);
  });

  it('shows a message, not a crash, when it keeps failing', async () => {
    const result = await loadDream(info(() => Promise.reject(new Error('offline'))));
    expect(result.ok).toBe(false);
  });
});
