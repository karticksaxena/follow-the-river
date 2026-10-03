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

function mouse(type: 'mousedown' | 'mouseup', button: number): Event {
  return Object.assign(new Event(type), { button });
}

describe('KeyState mouse buttons', () => {
  it('tracks mouse buttons as Mouse0 / Mouse2', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(mouse('mousedown', 0));
    expect(keys.isDown('Mouse0')).toBe(true);
    expect(keys.consumePress('Mouse0')).toBe(true);
    target.dispatchEvent(mouse('mouseup', 0));
    expect(keys.isDown('Mouse0')).toBe(false);
  });

  it('stops listening after detach', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    keys.detach();
    target.dispatchEvent(mouse('mousedown', 2));
    expect(keys.isDown('Mouse2')).toBe(false);
  });
});
