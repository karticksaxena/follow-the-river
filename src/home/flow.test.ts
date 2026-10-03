import { describe, expect, it } from 'vitest';
import { nextHomeState } from './flow';

describe('nextHomeState', () => {
  it('walks from sleeping to playing', () => {
    let state = nextHomeState('sleeping', 'start');
    state = nextHomeState(state, 'risen');
    state = nextHomeState(state, 'pick');
    state = nextHomeState(state, 'confirm');
    expect(nextHomeState(state, 'loaded')).toBe('playing');
  });

  it('returns to the dream cards when loading fails', () => {
    expect(nextHomeState('loading', 'load-failed')).toBe('picking');
  });

  it('lets the player back out of the content warning', () => {
    expect(nextHomeState('warning', 'back')).toBe('picking');
  });

  it('ignores a second Start click while rising', () => {
    expect(nextHomeState('rising', 'start')).toBe('rising');
  });
});
