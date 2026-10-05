import { MAX_FPS, type MaxFps } from './frame-cap';
import { toggleFullscreen } from './fullscreen';
import { pagerActionForKeyEvent, startPager, stepPager, type PagerAction } from './pager';
import { GRAPHICS, type Graphics, type Tier } from './quality';
import { DIFFICULTIES, SENSITIVITY_RANGE, type Difficulty, type Settings } from './settings';
import { button, el, type Overlay } from './ui';

/** Optional callbacks for a pager: voice lines, sounds. Existing callers pass none. */
export interface PageHooks {
  /** A page appeared (first open, Next or Back). */
  onPage?: (page: string, index: number) => void;
  /** The pager closed, just before `onDone`; `skipped` when the player pressed Skip. */
  onClose?: (skipped: boolean) => void;
}

export function showUnsupported(overlay: Overlay): void {
  overlay.panel((panel) => {
    panel.append(
      el('h1', '', "Kartik's Dreams"),
      el('p', 'big', 'Please play on a laptop or desktop computer.'),
      el('p', '', 'These games need a keyboard and a mouse or trackpad.'),
    );
  });
}

export function showMessage(overlay: Overlay, title: string, text: string): void {
  overlay.panel((panel) => panel.append(el('h1', '', title), el('p', 'big', text)));
}

/**
 * Player-paced pages: nothing advances on a timer. Enter, → or Space = next;
 * ← or Backspace = back; Skip ends early. `onDone` runs inside the key or click
 * handler, so it may request pointer lock.
 */
export function showPages(
  overlay: Overlay,
  pages: readonly string[],
  onDone: () => void,
  hooks: PageHooks = {},
): void {
  let state = startPager(pages.length);
  if (state.done) return onDone();
  const text = el('p', 'page-text');
  const count = el('p', 'page-count');
  const back = button('← Back', () => act('prev'));
  const next = button('Next →', () => act('next'), 'btn primary');
  const render = (): void => {
    text.textContent = pages[state.index] ?? '';
    count.textContent = `${state.index + 1} / ${state.total}`;
    hooks.onPage?.(pages[state.index] ?? '', state.index);
    back.disabled = state.index === 0;
    next.textContent = state.index + 1 === state.total ? 'Continue ✓' : 'Next →';
  };
  const onKey = (event: KeyboardEvent): void => {
    // Another screen replaced these pages: stop listening instead of acting on stale state.
    if (!panel.isConnected) return stopListening();
    const action = pagerActionForKeyEvent({
      code: event.code,
      repeat: event.repeat,
      modifier: event.altKey || event.ctrlKey || event.metaKey,
      onButton: event.target instanceof HTMLButtonElement,
    });
    if (!action) return;
    event.preventDefault();
    act(action);
  };
  // The mouse stays locked over pages (re-locking after each one re-shows Chrome's full-screen
  // bubble), so the buttons can't be clicked: a plain click turns the page. Esc frees the mouse.
  const onClick = (): void => {
    if (!panel.isConnected) return stopListening();
    if (document.pointerLockElement) act('next');
  };
  const stopListening = (): void => {
    removeEventListener('keydown', onKey);
    removeEventListener('click', onClick);
  };
  const act = (action: PagerAction): void => {
    state = stepPager(state, action);
    if (!state.done) return render();
    stopListening();
    overlay.closePanel();
    hooks.onClose?.(action === 'skip');
    onDone();
  };
  const panel = overlay.panel((body) => {
    const row = el('div', 'row');
    row.append(
      back,
      next,
      button('Skip', () => act('skip'), 'btn quiet'),
    );
    body.append(
      text,
      count,
      row,
      el('p', 'keys', 'Enter / click / → next · ← back · Esc shows the mouse'),
    );
  });
  // Caption at the top: what the text is about (the TV, Mom, the horde) sits at or below eye level.
  panel.classList.add('caption');
  addEventListener('keydown', onKey);
  addEventListener('click', onClick);
  render();
}

/** A player-paced question. Buttons only; `focus` (default the first) gets focus so Enter picks it. */
export function showChoice(
  overlay: Overlay,
  text: string,
  labels: readonly string[],
  onPick: (index: number) => void,
  focus = 0,
): void {
  const buttons = labels.map((label, index) =>
    button(
      label,
      () => {
        overlay.closePanel();
        onPick(index);
      },
      index === focus ? 'btn primary' : 'btn',
    ),
  );
  overlay.panel((panel) => {
    const row = el('div', 'row');
    row.append(...buttons);
    panel.append(el('p', 'page-text', text), row);
  });
  buttons[focus]?.focus();
}

export interface PauseMenuOptions {
  title: string;
  howToPlay: readonly string[];
  settings: Settings;
  /** The graphics tier in use right now (WebGL 2 caps High to Medium). */
  tier: Tier;
  onResume: () => void;
  onSettings: (settings: Settings) => void;
  onQuit: () => void;
}

function slider(
  label: string,
  min: number,
  max: number,
  value: number,
  onInput: (v: number) => void,
): HTMLElement {
  const wrap = el('label', 'slider', label);
  const input = el('input');
  Object.assign(input, { type: 'range', min: String(min), max: String(max), step: '0.05' });
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  wrap.append(input);
  return wrap;
}

const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  story: 'Story',
  normal: 'Normal',
  hard: 'Hard',
};

const GRAPHICS_LABEL: Readonly<Record<Graphics, string>> = {
  auto: 'Auto',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const MAX_FPS_LABEL: Readonly<Record<MaxFps, string>> = {
  '90': '90',
  '60': '60',
  display: 'Screen rate',
};

/** A titled row of buttons, the current one pressed (`on`), with a small note under it. */
function choiceRow<T extends string>(
  title: string,
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  current: T,
  onPick: (value: T) => void,
  note: string,
): HTMLElement {
  const buttons = values.map((value) =>
    button(labels[value], () => {
      onPick(value);
      mark(value);
    }),
  );
  function mark(now: T): void {
    buttons.forEach((b, i) => {
      const on = values[i] === now;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  mark(current);
  const row = el('div', 'row');
  row.append(...buttons);
  const wrap = el('div', 'difficulty');
  wrap.append(el('p', '', title), row, el('p', 'small', note));
  return wrap;
}

export function showPauseMenu(overlay: Overlay, options: PauseMenuOptions): void {
  const settings = { ...options.settings };
  overlay.panel((panel) => {
    const rules = el('ul', 'rules');
    rules.append(...options.howToPlay.map((rule) => el('li', '', rule)));
    rules.hidden = true;
    const change = (patch: Partial<Settings>): void => {
      Object.assign(settings, patch);
      options.onSettings({ ...settings });
    };
    panel.append(
      el('h1', '', options.title),
      button('Resume', options.onResume, 'btn primary'),
      button('How to play', () => (rules.hidden = !rules.hidden)),
      button('Full screen on/off', toggleFullscreen),
      rules,
      slider(
        'Mouse sensitivity',
        SENSITIVITY_RANGE.min,
        SENSITIVITY_RANGE.max,
        settings.sensitivity,
        (v) => change({ sensitivity: v }),
      ),
      slider('Volume', 0, 1, settings.volume, (v) => change({ volume: v })),
      choiceRow(
        'Difficulty',
        DIFFICULTIES,
        DIFFICULTY_LABEL,
        settings.difficulty,
        (difficulty) => change({ difficulty }),
        'Takes effect from the next wave.',
      ),
      choiceRow(
        'Graphics',
        GRAPHICS,
        GRAPHICS_LABEL,
        settings.graphics,
        (graphics) => change({ graphics }),
        `In use: ${GRAPHICS_LABEL[options.tier]}. Auto starts from your graphics card and lowers itself if the game runs slow.`,
      ),
      choiceRow(
        'Frame rate',
        MAX_FPS,
        MAX_FPS_LABEL,
        settings.maxFps,
        (maxFps) => change({ maxFps }),
        'The most frames drawn per second. 60 saves power and heat on laptops.',
      ),
      button('Quit to dreams', options.onQuit, 'btn quiet'),
    );
  });
}
