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
  // `fresh` makes the first set() write everything; after that fields are copied in place.
  const last: HudState = {
    battery: 0,
    arrows: 0,
    fishPacks: 0,
    ammo: 0,
    health: 0,
    showAmmo: false,
  };
  let fresh = true;
  let lastPrompt: string | null = null;

  return {
    set(s) {
      if (fresh || last.battery !== s.battery)
        battery.textContent = `🔦 ${batteryCells(s.battery)}`;
      if (fresh || last.arrows !== s.arrows) arrows.textContent = `➶ ${s.arrows}`;
      if (fresh || last.fishPacks !== s.fishPacks) fish.textContent = `🐟 ${s.fishPacks}`;
      if (fresh || last.ammo !== s.ammo) ammo.textContent = `● ${s.ammo}`;
      if (fresh || last.showAmmo !== s.showAmmo) ammo.hidden = !s.showAmmo;
      if (fresh || last.health !== s.health) {
        hurtEl.style.opacity = String(Math.max(0, Math.min(1, 1 - s.health / 100)));
      }
      fresh = false;
      last.battery = s.battery;
      last.arrows = s.arrows;
      last.fishPacks = s.fishPacks;
      last.ammo = s.ammo;
      last.health = s.health;
      last.showAmmo = s.showAmmo;
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
