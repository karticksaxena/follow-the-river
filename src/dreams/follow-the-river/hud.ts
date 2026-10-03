import { el } from '../../engine/ui';

export interface HudState {
  battery: number;
  arrows: number;
  fishPacks: number;
  ammo: number;
  health: number;
  showAmmo: boolean;
  /** The weapon in hand (the indicator shows with the ammo once you own the gun). */
  weapon: 'bow' | 'gun';
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

interface HudEls {
  readonly hud: HTMLElement;
  readonly hurtEl: HTMLElement;
  readonly battery: HTMLElement;
  readonly arrows: HTMLElement;
  readonly fish: HTMLElement;
  readonly ammo: HTMLElement;
  readonly weapons: Readonly<Record<'bow' | 'gun', HTMLElement>>;
  readonly weaponRow: HTMLElement;
  readonly promptEl: HTMLElement;
  // Last written values, so the DOM is only touched when something changes.
  // `fresh` makes the first set() write everything; after that fields are copied in place.
  readonly last: HudState;
  fresh: boolean;
  lastPrompt: string | null;
}

function buildHud(root: HTMLElement): HudEls {
  const hud = el('div', 'hud');
  const hurtEl = el('div', 'hud-hurt');
  const dot = el('div', 'hud-dot');
  const stats = el('div', 'hud-stats');
  const [battery, arrows, fish, ammo] = [el('div'), el('div'), el('div'), el('div')];
  const promptEl = el('div', 'hud-prompt');
  const weapons = { bow: el('span'), gun: el('span') };
  weapons.bow.textContent = '1 Bow';
  weapons.gun.textContent = '2 Gun';
  const weaponRow = el('div');
  weaponRow.append(weapons.bow, ' · ', weapons.gun);
  // Hidden until the first set() says the gun is owned (a chapter can be built during the intro).
  ammo.hidden = true;
  weaponRow.hidden = true;
  stats.append(battery, arrows, fish, ammo, weaponRow);
  hud.append(hurtEl, dot, stats, promptEl);
  root.append(hud);
  hurtEl.addEventListener('animationend', () => hurtEl.classList.remove('flash'));
  const last: HudState = {
    battery: 0,
    arrows: 0,
    fishPacks: 0,
    ammo: 0,
    health: 0,
    showAmmo: false,
    weapon: 'bow',
  };
  return {
    hud,
    hurtEl,
    battery,
    arrows,
    fish,
    ammo,
    weapons,
    weaponRow,
    promptEl,
    last,
    fresh: true,
    lastPrompt: null,
  };
}

function writeStats(h: HudEls, s: HudState): void {
  const { last, fresh } = h;
  if (fresh || last.battery !== s.battery) h.battery.textContent = `🔦 ${batteryCells(s.battery)}`;
  if (fresh || last.arrows !== s.arrows) h.arrows.textContent = `➶ ${s.arrows}`;
  if (fresh || last.fishPacks !== s.fishPacks) h.fish.textContent = `🐟 ${s.fishPacks}`;
  if (fresh || last.ammo !== s.ammo) h.ammo.textContent = `● ${s.ammo}`;
  if (fresh || last.showAmmo !== s.showAmmo) {
    h.ammo.hidden = !s.showAmmo;
    h.weaponRow.hidden = !s.showAmmo;
  }
  if (fresh || last.weapon !== s.weapon) {
    h.weapons.bow.style.opacity = s.weapon === 'bow' ? '1' : '0.4';
    h.weapons.gun.style.opacity = s.weapon === 'gun' ? '1' : '0.4';
  }
  if (fresh || last.health !== s.health) {
    h.hurtEl.style.opacity = String(Math.max(0, Math.min(1, 1 - s.health / 100)));
  }
}

function setHud(h: HudEls, s: HudState): void {
  writeStats(h, s);
  h.fresh = false;
  const { last } = h;
  last.battery = s.battery;
  last.arrows = s.arrows;
  last.fishPacks = s.fishPacks;
  last.ammo = s.ammo;
  last.health = s.health;
  last.showAmmo = s.showAmmo;
  last.weapon = s.weapon;
}

function flashHurt(h: HudEls): void {
  // Restart the CSS animation even when already flashing.
  h.hurtEl.classList.remove('flash');
  void h.hurtEl.offsetWidth;
  h.hurtEl.classList.add('flash');
}

export function createHud(root: HTMLElement): Hud {
  const h = buildHud(root);
  return {
    set: (s) => setHud(h, s),
    prompt(text) {
      if (text === h.lastPrompt) return;
      h.lastPrompt = text;
      h.promptEl.textContent = text ?? '';
    },
    hurt: () => flashHurt(h),
    show(visible) {
      h.hud.hidden = !visible;
    },
    dispose() {
      h.hud.remove();
    },
  };
}
