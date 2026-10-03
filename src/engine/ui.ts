/** Small DOM helpers. Text always goes through textContent, never innerHTML. */
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
}

export function createOverlay(root: HTMLElement): Overlay {
  const fader = el('div', 'fader');
  root.append(fader);
  let current: HTMLElement | null = null;
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
    closePanel() {
      current?.remove();
      current = null;
    },
  };
}
