import { el } from '../../engine/ui';

export interface HudState {
  battery: number;
  arrows: number;
  fishPacks: number;
  ammo: number;
  health: number;
  showAmmo: boolean;
}
export interface Hud {
  set(state: HudState): void;
  prompt(text: string | null): void;
  hurt(): void;
  show(visible: boolean): void;
  dispose(): void;
}

const CELLS = 5;

/** Five-cell battery meter, e.g. "▮▮▮▯▯". Rounds up so a nearly-empty battery still shows one. */
export function batteryCells(battery: number): string {
  const full = Math.max(0, Math.min(CELLS, Math.ceil(battery / (100 / CELLS))));
  return '▮'.repeat(full) + '▯'.repeat(CELLS - full);
}

export function createHud(root: HTMLElement): Hud {
  const hud = el('div', 'hud');
  const hurtEl = el('div', 'hud-hurt');
  const dot = el('div', 'hud-dot');
  const stats = el('div', 'hud-stats');
  const [battery, arrows, fish, ammo] = [el('div'), el('div'), el('div'), el('div')];
  const promptEl = el('div', 'hud-prompt');
  stats.append(battery, arrows, fish, ammo);
  hud.append(hurtEl, dot, stats, promptEl);
  root.append(hud);
  hurtEl.addEventListener('animationend', () => hurtEl.classList.remove('flash'));

  // Last written values, so the DOM is only touched when something changes.
  let last: HudState | null = null;
  let lastPrompt: string | null = null;

  return {
    set(s) {
      if (last?.battery !== s.battery) battery.textContent = `🔦 ${batteryCells(s.battery)}`;
      if (last?.arrows !== s.arrows) arrows.textContent = `➶ ${s.arrows}`;
      if (last?.fishPacks !== s.fishPacks) fish.textContent = `🐟 ${s.fishPacks}`;
      if (last?.ammo !== s.ammo) ammo.textContent = `● ${s.ammo}`;
      if (last?.showAmmo !== s.showAmmo) ammo.hidden = !s.showAmmo;
      if (last?.health !== s.health) {
        hurtEl.style.opacity = String(Math.max(0, Math.min(1, 1 - s.health / 100)));
      }
      last = { ...s };
    },
    prompt(text) {
      if (text === lastPrompt) return;
      lastPrompt = text;
      promptEl.textContent = text ?? '';
    },
    hurt() {
      // Restart the CSS animation even when already flashing.
      hurtEl.classList.remove('flash');
      void hurtEl.offsetWidth;
      hurtEl.classList.add('flash');
    },
    show(visible) {
      hud.hidden = !visible;
    },
    dispose() {
      hud.remove();
    },
  };
}
