import { el, type Overlay } from './ui';

export interface Point {
  x: number;
  y: number;
}

/** Move a drawn cursor by a mouse delta, kept inside the viewport. */
export function moveCursor(
  pos: Point,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Point {
  return {
    x: Math.min(Math.max(pos.x + dx, 0), width),
    y: Math.min(Math.max(pos.y + dy, 0), height),
  };
}

interface Closest {
  closest(selector: string): unknown;
}

/** What a click with a locked mouse does: the enabled button under the cursor, or nothing. */
export function lockedClickTarget(under: Closest | null): HTMLButtonElement | null {
  const hit = under?.closest('button:not(:disabled)');
  return hit instanceof HTMLButtonElement ? hit : null;
}

/**
 * A game-drawn cursor for a panel with buttons while the pointer stays locked (releasing the lock
 * would show Chrome's full-screen bubble again). It follows the mouse, and a click presses the
 * button under it. With the lock off (Esc, `?nolock`) the real cursor is used and this stays hidden.
 * Returns the stop function; it also stops by itself once the panel is gone.
 */
export function attachCursor(overlay: Overlay, panel: HTMLElement): () => void {
  const dot = el('div', 'drawn-cursor');
  dot.hidden = true;
  overlay.root.append(dot);
  const rect = panel.getBoundingClientRect();
  let pos: Point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const show = (): void => {
    dot.hidden = !(document.pointerLockElement && panel.isConnected);
    dot.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  };
  const alive = (): boolean => {
    if (overlay.holds(panel)) return true;
    stop();
    return false;
  };
  const onMove = (event: MouseEvent): void => {
    if (!alive() || !document.pointerLockElement) return;
    pos = moveCursor(pos, event.movementX, event.movementY, innerWidth, innerHeight);
    show();
  };
  const onClick = (event: MouseEvent): void => {
    // The synthetic click below bubbles back here: only real clicks count.
    if (!event.isTrusted || !alive() || !document.pointerLockElement) return;
    lockedClickTarget(document.elementFromPoint(pos.x, pos.y))?.click();
  };
  const onLockChange = (): void => {
    if (alive()) show();
  };
  function stop(): void {
    removeEventListener('mousemove', onMove);
    removeEventListener('click', onClick);
    document.removeEventListener('pointerlockchange', onLockChange);
    dot.remove();
  }
  addEventListener('mousemove', onMove);
  addEventListener('click', onClick);
  document.addEventListener('pointerlockchange', onLockChange);
  show();
  return stop;
}
