import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockedClickTarget, moveCursor } from './cursor';

describe('moveCursor', () => {
  it('moves by the mouse delta', () => {
    expect(moveCursor({ x: 10, y: 20 }, 5, -3, 100, 100)).toEqual({ x: 15, y: 17 });
  });

  it('stays inside the viewport', () => {
    expect(moveCursor({ x: 5, y: 95 }, -50, 50, 100, 100)).toEqual({ x: 0, y: 100 });
    expect(moveCursor({ x: 95, y: 5 }, 50, -50, 100, 100)).toEqual({ x: 100, y: 0 });
  });
});

describe('lockedClickTarget', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing when the click lands on nothing or on no button', () => {
    vi.stubGlobal(
      'HTMLButtonElement',
      class {
        tag = 'button';
      },
    );
    expect(lockedClickTarget(null)).toBeNull();
    expect(lockedClickTarget({ closest: () => null })).toBeNull();
  });

  it('presses the button under the cursor', () => {
    class FakeButton {
      tag = 'button';
    }
    vi.stubGlobal('HTMLButtonElement', FakeButton);
    const button = new FakeButton();
    expect(lockedClickTarget({ closest: () => button })).toBe(button);
  });
});
