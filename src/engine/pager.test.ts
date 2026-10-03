import { describe, expect, it } from 'vitest';
import {
  pagerActionForKey,
  pagerActionForKeyEvent,
  startPager,
  stepPager,
  type ReadingKey,
} from './pager';

describe('pager', () => {
  it('moves forward one page at a time and finishes after the last', () => {
    let state = startPager(2);
    state = stepPager(state, 'next');
    expect(state).toEqual({ index: 1, total: 2, done: false });
    expect(stepPager(state, 'next').done).toBe(true);
  });

  it('goes back but never before the first page', () => {
    const second = stepPager(startPager(3), 'next');
    expect(stepPager(second, 'prev').index).toBe(0);
    expect(stepPager(startPager(3), 'prev').index).toBe(0);
  });

  it('skips straight to the end', () => {
    expect(stepPager(startPager(5), 'skip').done).toBe(true);
  });

  it('is already done with no pages', () => {
    expect(startPager(0).done).toBe(true);
  });

  it('maps reading keys', () => {
    expect(pagerActionForKey('Enter')).toBe('next');
    expect(pagerActionForKey('ArrowRight')).toBe('next');
    expect(pagerActionForKey('Space')).toBe('next');
    expect(pagerActionForKey('ArrowLeft')).toBe('prev');
    expect(pagerActionForKey('Backspace')).toBe('prev');
    expect(pagerActionForKey('KeyW')).toBeNull();
  });
});

const key = (code: string, extra: Partial<ReadingKey> = {}): ReadingKey => ({
  code,
  repeat: false,
  modifier: false,
  onButton: false,
  ...extra,
});

describe('pagerActionForKeyEvent', () => {
  it('keeps arrows and Backspace working after a button was clicked', () => {
    expect(pagerActionForKeyEvent(key('ArrowRight', { onButton: true }))).toBe('next');
    expect(pagerActionForKeyEvent(key('ArrowLeft', { onButton: true }))).toBe('prev');
    expect(pagerActionForKeyEvent(key('Backspace', { onButton: true }))).toBe('prev');
  });

  it('leaves Enter and Space on a focused button to the button itself', () => {
    expect(pagerActionForKeyEvent(key('Enter', { onButton: true }))).toBeNull();
    expect(pagerActionForKeyEvent(key('Space', { onButton: true }))).toBeNull();
  });

  it('ignores a held-down key so pages never race past', () => {
    expect(pagerActionForKeyEvent(key('Enter', { repeat: true }))).toBeNull();
  });

  it('leaves browser shortcuts like Alt+Left alone', () => {
    expect(pagerActionForKeyEvent(key('ArrowLeft', { modifier: true }))).toBeNull();
  });

  it('turns pages with Enter when no button has focus', () => {
    expect(pagerActionForKeyEvent(key('Enter'))).toBe('next');
  });
});
