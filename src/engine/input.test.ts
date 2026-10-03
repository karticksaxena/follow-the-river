import { describe, expect, it } from 'vitest';
import { KeyState } from './input';

function key(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  return Object.assign(new Event(type), { code, repeat });
}

describe('KeyState', () => {
  it('tracks held keys', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(keys.isDown('KeyW')).toBe(true);
    target.dispatchEvent(key('keyup', 'KeyW'));
    expect(keys.isDown('KeyW')).toBe(false);
  });

  it('reports a press once, ignoring auto-repeat', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(key('keydown', 'KeyF'));
    target.dispatchEvent(key('keydown', 'KeyF', true));
    expect(keys.consumePress('KeyF')).toBe(true);
    expect(keys.consumePress('KeyF')).toBe(false);
  });

  it('forgets everything when the window loses focus', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(new Event('blur'));
    expect(keys.isDown('KeyW')).toBe(false);
  });
});
