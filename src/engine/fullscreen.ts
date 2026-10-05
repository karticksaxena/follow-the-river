/** Full screen hides the browser bars. Needs a click or key press; failures are ignored. */
export function enterFullscreen(): void {
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen().catch(() => undefined);
}

export function toggleFullscreen(): void {
  if (!document.fullscreenElement) return enterFullscreen();
  document.exitFullscreen().catch(() => undefined);
}

/**
 * Keys the game uses plus common browser ones. Keyboard Lock (Chromium only, JS full screen only)
 * sends them, with any modifier (Cmd/Ctrl+W, S, F, R, P ...), to the game instead of the browser;
 * the key handler also cancels their default action. Esc is left out on purpose: it must still
 * release the mouse and open the pause menu. Safari/Firefox have no `navigator.keyboard`.
 */
export const LOCKED_KEYS: readonly string[] = [
  ...'WASDEFRPQLN'.split('').map((letter) => `Key${letter}`),
  ...'1234'.split('').map((digit) => `Digit${digit}`),
  'Space',
  'Tab',
  'Backspace',
  'F5',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

interface KeyboardLockApi {
  lock?(codes: readonly string[]): Promise<void>;
  unlock?(): void;
}

const keyboardApi = (): KeyboardLockApi | undefined =>
  (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard;

let wanted = false;
let held = false;
let listening = false;

function sync(): void {
  const api = keyboardApi();
  if (wanted && !held && document.fullscreenElement && api?.lock) {
    held = true;
    api.lock(LOCKED_KEYS).catch(() => {
      held = false;
    });
  } else if (held && !document.fullscreenElement) {
    held = false; // leaving full screen releases the lock by itself
  } else if (held && !wanted) {
    held = false;
    api?.unlock?.();
  }
}

/** Capture the keys while playing. Takes effect now if full screen is on, else when it turns on. */
export function lockKeyboard(): void {
  wanted = true;
  if (!listening) {
    listening = true;
    document.addEventListener('fullscreenchange', sync);
  }
  sync();
}

/** Give the keys back to the browser (pause menu, home, leaving a dream). */
export function unlockKeyboard(): void {
  wanted = false;
  sync();
}
