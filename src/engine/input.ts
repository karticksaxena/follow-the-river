import { LOCKED_KEYS } from './fullscreen';

function keyCode(event: Event): string {
  return 'code' in event && typeof event.code === 'string' ? event.code : '';
}

function buttonCode(event: Event): string {
  return 'button' in event && typeof event.button === 'number' ? `Mouse${event.button}` : '';
}

const GAME_KEYS = new Set(LOCKED_KEYS);

/** True when the browser's own action for this key (scroll, find, reload, save ...) must be cancelled. */
export function blocksDefault(code: string, typing: boolean): boolean {
  return !typing && GAME_KEYS.has(code);
}

function isTyping(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Tracks which keys are held, by physical key code (so WASD works on any layout). */
export class KeyState {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private target: EventTarget | null = null;
  /** On while playing (not in menus, where Tab/Space/arrows must work). */
  blockDefaults = false;

  private readonly onDown = (event: Event): void => {
    const code = keyCode(event);
    if (this.blockDefaults && blocksDefault(code, isTyping(event.target))) event.preventDefault();
    const repeat = 'repeat' in event && event.repeat === true;
    if (!repeat) this.pressed.add(code);
    this.held.add(code);
  };

  private readonly onUp = (event: Event): void => {
    this.held.delete(keyCode(event));
  };

  private readonly onMouseDown = (event: Event): void => {
    const code = buttonCode(event);
    this.pressed.add(code);
    this.held.add(code);
  };

  private readonly onMouseUp = (event: Event): void => {
    this.held.delete(buttonCode(event));
  };

  /** A wheel notch is a press of `WheelUp` or `WheelDown`. */
  private readonly onWheel = (event: Event): void => {
    const dy = 'deltaY' in event && typeof event.deltaY === 'number' ? event.deltaY : 0;
    if (dy !== 0) this.pressed.add(dy < 0 ? 'WheelUp' : 'WheelDown');
  };

  private readonly onBlur = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  attach(target: EventTarget): void {
    this.detach();
    this.target = target;
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('mousedown', this.onMouseDown);
    target.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('wheel', this.onWheel);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    this.target?.removeEventListener('keydown', this.onDown);
    this.target?.removeEventListener('keyup', this.onUp);
    this.target?.removeEventListener('mousedown', this.onMouseDown);
    this.target?.removeEventListener('mouseup', this.onMouseUp);
    this.target?.removeEventListener('wheel', this.onWheel);
    this.target?.removeEventListener('blur', this.onBlur);
    this.target = null;
    this.onBlur();
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True once per key press (for toggles like the flashlight). */
  consumePress(code: string): boolean {
    return this.pressed.delete(code);
  }
}
