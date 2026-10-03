import { toggleFullscreen } from './fullscreen';
import { pagerActionForKeyEvent, startPager, stepPager, type PagerAction } from './pager';
import { SENSITIVITY_RANGE, type Settings } from './settings';
import { button, el, type Overlay } from './ui';

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
export function showPages(overlay: Overlay, pages: readonly string[], onDone: () => void): void {
  let state = startPager(pages.length);
  if (state.done) return onDone();
  const text = el('p', 'page-text');
  const count = el('p', 'page-count');
  const back = button('← Back', () => act('prev'));
  const next = button('Next →', () => act('next'), 'btn primary');
  const render = (): void => {
    text.textContent = pages[state.index] ?? '';
    count.textContent = `${state.index + 1} / ${state.total}`;
    back.disabled = state.index === 0;
    next.textContent = state.index + 1 === state.total ? 'Continue ✓' : 'Next →';
  };
  const onKey = (event: KeyboardEvent): void => {
    // Another screen replaced these pages: stop listening instead of acting on stale state.
    if (!panel.isConnected) return removeEventListener('keydown', onKey);
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
  const act = (action: PagerAction): void => {
    state = stepPager(state, action);
    if (!state.done) return render();
    removeEventListener('keydown', onKey);
    overlay.closePanel();
    onDone();
  };
  const panel = overlay.panel((body) => {
    const row = el('div', 'row');
    row.append(
      back,
      next,
      button('Skip', () => act('skip'), 'btn quiet'),
    );
    body.append(text, count, row, el('p', 'keys', 'Enter / → next · ← back'));
  });
  addEventListener('keydown', onKey);
  render();
}

/** A player-paced question. Buttons only; the first one gets focus so Enter picks it. */
export function showChoice(
  overlay: Overlay,
  text: string,
  labels: readonly string[],
  onPick: (index: number) => void,
): void {
  const buttons = labels.map((label, index) =>
    button(
      label,
      () => {
        overlay.closePanel();
        onPick(index);
      },
      index === 0 ? 'btn primary' : 'btn',
    ),
  );
  overlay.panel((panel) => {
    const row = el('div', 'row');
    row.append(...buttons);
    panel.append(el('p', 'page-text', text), row);
  });
  buttons[0]?.focus();
}

export interface PauseMenuOptions {
  title: string;
  howToPlay: readonly string[];
  settings: Settings;
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
      button('Quit to dreams', options.onQuit, 'btn quiet'),
    );
  });
}
