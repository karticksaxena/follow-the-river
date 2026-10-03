export type HomeState = 'sleeping' | 'rising' | 'picking' | 'warning' | 'loading' | 'playing';
export type HomeEvent = 'start' | 'risen' | 'pick' | 'back' | 'confirm' | 'load-failed' | 'loaded';

const NEXT: Record<HomeState, Partial<Record<HomeEvent, HomeState>>> = {
  sleeping: { start: 'rising' },
  rising: { risen: 'picking' },
  picking: { pick: 'warning' },
  warning: { back: 'picking', confirm: 'loading' },
  loading: { 'load-failed': 'picking', loaded: 'playing' },
  playing: {},
};

/** Home screen steps. Unknown events (double clicks, late callbacks) leave the state unchanged. */
export function nextHomeState(state: HomeState, event: HomeEvent): HomeState {
  return NEXT[state][event] ?? state;
}
