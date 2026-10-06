/* oxlint-disable typescript/no-unsafe-type-assertion -- a minimal fake DOM (node has none) */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createOverlay } from './ui';

/** Just enough of an element for the overlay: children, remove, classes, text, style. */
class FakeEl {
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  className = '';
  textContent = '';
  hidden = false;
  style: Record<string, string> = {};
  classList = {
    toggle: vi.fn<() => void>(),
    add: vi.fn<() => void>(),
    remove: vi.fn<() => void>(),
  };
  append(...nodes: FakeEl[]): void {
    for (const n of nodes) {
      n.remove();
      n.parent = this;
      this.children.push(n);
    }
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
}

beforeAll(() => vi.stubGlobal('document', { createElement: () => new FakeEl() }));
afterAll(() => vi.unstubAllGlobals());

describe('overlay panels under the pause menu', () => {
  it('keeps the set-aside pages while the menu shows, and Resume brings them back', () => {
    const root = new FakeEl();
    const overlay = createOverlay(root as unknown as HTMLElement);
    const pages = overlay.panel(() => undefined);
    overlay.suspendPanel(); // Esc over pages
    const menu = overlay.panel(() => undefined); // the pause menu opens
    expect(overlay.holds(pages)).toBe(true); // the pages wait under it (the bug dropped them here)
    overlay.resumePanel(); // Resume
    const shown = root.children as unknown as HTMLElement[];
    expect(shown).toContain(pages);
    expect(shown).not.toContain(menu); // the menu is gone
    expect(overlay.holds(pages)).toBe(true);
  });

  it('closePanel drops both the shown and the set-aside panel', () => {
    const root = new FakeEl();
    const overlay = createOverlay(root as unknown as HTMLElement);
    const pages = overlay.panel(() => undefined);
    overlay.suspendPanel();
    overlay.panel(() => undefined);
    overlay.closePanel();
    expect(overlay.holds(pages)).toBe(false);
  });
});
