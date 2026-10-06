/** Small DOM helpers. Text always goes through textContent, never innerHTML. */
import { DefaultLoadingManager } from 'three/webgpu';
import { createLoadingState, trackProgress } from './loader';

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
  /** Take the panel off screen but keep it (pages under the pause menu); `resumePanel` puts it back. */
  suspendPanel(): void;
  resumePanel(): void;
  /** The panel is the current one, or the one set aside by `suspendPanel`. */
  holds(panel: HTMLElement): boolean;
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
  let base: string | null = null;
  // Every GLTF/texture load goes through three's default manager: show its progress on the label.
  trackProgress(
    DefaultLoadingManager,
    () => base,
    (text) => void (label.textContent = text),
  );
  let current: HTMLElement | null = null;
  let aside: HTMLElement | null = null;
  const state = createLoadingState(
    (busy) => {
      root.classList.toggle('loading', busy);
      if (!busy) base = null;
    },
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
      // Keep `aside`: the pause menu opens over pages Esc set aside, and Resume needs them back.
      current?.remove();
      current = el('div', 'panel');
      build(current);
      root.append(current);
      return current;
    },
    loading(text = 'Loading…') {
      label.textContent = text;
      base = text;
      return state.start();
    },
    closePanel() {
      current?.remove();
      current = null;
      aside = null;
    },
    suspendPanel() {
      if (!current) return;
      aside = current;
      current.remove();
      current = null;
    },
    resumePanel() {
      if (!aside) return;
      current?.remove();
      current = aside;
      aside = null;
      root.append(current);
    },
    holds: (panel) => panel === current || panel === aside,
  };
}
