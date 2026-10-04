import { el } from '../../engine/ui';
import { MAX_HEALTH } from './flow';
import type { GunKind } from './state';
import { SLOTS, type Weapon } from './weapons';
import { ATTACK } from './zombies/brain';

export interface HudState {
  battery: number;
  /** Spare batteries. */
  cells: number;
  arrows: number;
  fishPacks: number;
  /** Rounds for the gun in hand (hidden with the bow). */
  ammo: number;
  health: number;
  /** Guns owned, as bits (see `gunBits`): crates are optional, so any mix is possible. */
  guns: number;
  weapon: Weapon;
  /** The wave being fought (1-based; 0 = none), of how many, and zombies left in it. */
  wave: number;
  waves: number;
}

const NAMES: Readonly<Record<Weapon, string>> = {
  bow: 'Bow',
  pistol: 'Pistol',
  shotgun: 'Shotgun',
  rifle: 'Rifle',
};

const BIT: Readonly<Record<Weapon, number>> = { bow: 0, pistol: 1, shotgun: 2, rifle: 4 };

/** The guns owned as bits, for the HUD's change check (no array compare per frame). */
export function gunBits(guns: readonly GunKind[]): number {
  let bits = 0;
  for (const g of guns) bits |= BIT[g];
  return bits;
}

/** "Wave 2 of 3", or '' between waves. */
export function waveText(wave: number, waves: number): string {
  return wave > 0 ? `Wave ${wave} of ${waves}` : '';
}

/** The torch: its cells and the spares, e.g. "🔦 ▮▮▮▯▯ +2". */
export function torchText(battery: number, cells: number): string {
  return `🔦 ${batteryCells(battery)}${cells > 0 ? ` +${cells}` : ''}`;
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

/** Hits you can take: "♥♥♡" after one (a zombie blow takes ATTACK.damage of MAX_HEALTH). */
export function hearts(health: number): string {
  const total = Math.ceil(MAX_HEALTH / ATTACK.damage);
  const left = Math.max(0, Math.min(total, Math.ceil(health / ATTACK.damage)));
  return '♥'.repeat(left) + '♡'.repeat(total - left);
}

interface HudEls {
  readonly hud: HTMLElement;
  readonly hurtEl: HTMLElement;
  readonly health: HTMLElement;
  readonly battery: HTMLElement;
  readonly arrows: HTMLElement;
  readonly fish: HTMLElement;
  readonly ammo: HTMLElement;
  readonly weapons: Readonly<Record<Weapon, HTMLElement>>;
  readonly weaponRow: HTMLElement;
  readonly waveEl: HTMLElement;
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
  const health = el('div', 'hud-health');
  const [battery, arrows, fish, ammo] = [el('div'), el('div'), el('div'), el('div')];
  const promptEl = el('div', 'hud-prompt');
  const weapons = { bow: el('span'), pistol: el('span'), shotgun: el('span'), rifle: el('span') };
  const weaponRow = el('div');
  SLOTS.forEach((w, i) => {
    weapons[w].textContent = `${i > 0 ? ' · ' : ''}${i + 1} ${NAMES[w]}`;
    weaponRow.append(weapons[w]);
  });
  // Hidden until the first set() says a gun is owned (a chapter can be built during the intro).
  ammo.hidden = true;
  weaponRow.hidden = true;
  const waveEl = el('div', 'hud-wave');
  stats.append(health, battery, arrows, fish, ammo, weaponRow);
  hud.append(hurtEl, dot, waveEl, stats, promptEl);
  root.append(hud);
  hurtEl.addEventListener('animationend', () => hurtEl.classList.remove('flash'));
  const last: HudState = {
    battery: 0,
    cells: 0,
    arrows: 0,
    fishPacks: 0,
    ammo: 0,
    health: 0,
    guns: 0,
    weapon: 'bow',
    wave: 0,
    waves: 0,
  };
  return {
    hud,
    hurtEl,
    health,
    battery,
    arrows,
    fish,
    ammo,
    weapons,
    weaponRow,
    waveEl,
    promptEl,
    last,
    fresh: true,
    lastPrompt: null,
  };
}

function writeWeapons(h: HudEls, s: HudState): void {
  const { last, fresh } = h;
  if (fresh || last.guns !== s.guns) {
    h.weaponRow.hidden = s.guns === 0;
    for (const w of SLOTS) h.weapons[w].hidden = w !== 'bow' && (s.guns & BIT[w]) === 0;
  }
  if (fresh || last.weapon !== s.weapon) {
    for (const w of SLOTS) h.weapons[w].style.opacity = w === s.weapon ? '1' : '0.4';
    h.ammo.hidden = s.weapon === 'bow';
  }
  if (fresh || last.ammo !== s.ammo) h.ammo.textContent = `● ${s.ammo}`;
}

function writeStats(h: HudEls, s: HudState): void {
  const { last, fresh } = h;
  const cells = Math.ceil(s.battery / 20);
  if (fresh || Math.ceil(last.battery / 20) !== cells || last.cells !== s.cells) {
    h.battery.textContent = torchText(s.battery, s.cells);
  }
  if (fresh || last.arrows !== s.arrows) h.arrows.textContent = `➶ ${s.arrows}`;
  if (fresh || last.fishPacks !== s.fishPacks) h.fish.textContent = `🐟 ${s.fishPacks}`;
  writeWeapons(h, s);
  if (fresh || last.wave !== s.wave) {
    h.waveEl.textContent = waveText(s.wave, s.waves);
  }
  if (fresh || last.health !== s.health) {
    h.health.textContent = hearts(s.health);
    h.health.classList.toggle('low', s.health <= ATTACK.damage);
    h.hurtEl.style.opacity = String(Math.max(0, Math.min(1, 1 - s.health / 100)));
  }
}

function setHud(h: HudEls, s: HudState): void {
  writeStats(h, s);
  h.fresh = false;
  Object.assign(h.last, s);
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
