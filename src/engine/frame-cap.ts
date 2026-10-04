/** Frame cap: the pause-menu "Frame rate" choices. */
export type MaxFps = '90' | '60' | 'display';
export const MAX_FPS: readonly MaxFps[] = ['90', '60', 'display'];

/** A frame may come this early (seconds): display jitter must not skip a frame on a 60 Hz screen. */
const TOLERANCE = 0.002;

export interface Pacer {
  /** Seconds banked towards the next frame. */
  acc: number;
  /** Seconds since the last rendered frame; set when `shouldRender` says yes. */
  dt: number;
  since: number;
}

export function newPacer(): Pacer {
  return { acc: capPeriod('60'), dt: 0, since: 0 }; // banked: the first tick draws
}

/** Seconds per frame at the cap; 0 means no cap. */
export function capPeriod(cap: MaxFps): number {
  return cap === 'display' ? 0 : 1 / Number(cap);
}

/**
 * Feed the time of one display tick. True when a frame should be drawn now; `p.dt` is then the
 * time since the previous drawn frame. The leftover carries over (no drift) but is kept within 0..half a
 * period (a hitch is not followed by a burst, a display a hair fast is not skipped). A zero delta (hidden tab) always draws.
 */
export function shouldRender(p: Pacer, tick: number, cap: MaxFps): boolean {
  const period = capPeriod(cap);
  p.acc += tick;
  p.since += tick;
  if (period > 0 && tick > 0 && p.acc < period - TOLERANCE) return false;
  p.acc = Math.min(Math.max(p.acc - period, 0), period / 2); // never negative: a 60 Hz screen at 60 must not drift into a skip
  p.dt = p.since;
  p.since = 0;
  return true;
}
