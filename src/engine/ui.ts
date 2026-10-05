/** Small DOM helpers. Text always goes through textContent, never innerHTML. */
import { createLoadingState } from './loader';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export interface Overlay {
  readonly root: HTMLElement;
  /** Fade the screen to black (true) or back (false). */
  fade(toBlack: boolean, ms?: number): Promise<void>;
  /** Replace the current panel. `build` fills it; returns the panel element. */
  panel(build: (panel: HTMLElement) => void): HTMLElement;
  closePanel(): void;
  /**
   * A wait on black: hides the HUD now, fades a small spinner in if it lasts past ~150 ms. Call the
   * returned function when done (then fade the screen back in). Waits nest.
   */
  loading(text?: string): () => void;
}

export function createOverlay(root: HTMLElement): Overlay {
  const fader = el('div', 'fader');
  root.append(fader);
  const label = el('p');
  const loader = el('div', 'loader');
  loader.append(el('div', 'loader-ring'), label);
  root.append(loader);
  let current: HTMLElement | null = null;
  const state = createLoadingState(
    (busy) => root.classList.toggle('loading', busy),
    (visible) => loader.classList.toggle('on', visible),
  );
  return {
    root,
    fade(toBlack, ms = 900) {
      fader.style.transitionDuration = `${ms}ms`;
      fader.classList.toggle('black', toBlack);
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    panel(build) {
      current?.remove();
      current = el('div', 'panel');
      build(current);
      root.append(current);
      return current;
    },
    loading(text = 'Loading…') {
      label.textContent = text;
      return state.start();
    },
    closePanel() {
      current?.remove();
      current = null;
    },
  };
}
