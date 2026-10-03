function keyCode(event: Event): string {
  return 'code' in event && typeof event.code === 'string' ? event.code : '';
}

/** Tracks which keys are held, by physical key code (so WASD works on any layout). */
export class KeyState {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private target: EventTarget | null = null;

  private readonly onDown = (event: Event): void => {
    const code = keyCode(event);
    const repeat = 'repeat' in event && event.repeat === true;
    if (!repeat) this.pressed.add(code);
    this.held.add(code);
  };

  private readonly onUp = (event: Event): void => {
    this.held.delete(keyCode(event));
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
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    this.target?.removeEventListener('keydown', this.onDown);
    this.target?.removeEventListener('keyup', this.onUp);
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
