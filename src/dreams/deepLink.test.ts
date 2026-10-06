import { describe, expect, it } from 'vitest';
import { dreamFromSearch } from './deepLink';
import { DREAMS } from './registry';
import type { DreamInfo } from './types';

const base = DREAMS[0];
const dreams: DreamInfo[] = [
  { ...base, id: 'a' },
  { ...base, id: 'b' },
];

describe('dreamFromSearch', () => {
  it('finds a dream by id', () => expect(dreamFromSearch('?dream=b', dreams)).toBe(dreams[1]));
  it('works beside other params', () =>
    expect(dreamFromSearch('?nolock&dream=a&phase=day1', dreams)).toBe(dreams[0]));
  it('is null for unknown, empty or missing ids', () => {
    expect(dreamFromSearch('?dream=zzz', dreams)).toBeNull();
    expect(dreamFromSearch('?dream=', dreams)).toBeNull();
    expect(dreamFromSearch('', dreams)).toBeNull();
  });
});
