let on = false;

/** True while a warm-up draws behind black (`stage.warming`): draw-skipping shortcuts must draw once. */
export const isWarming = (): boolean => on;

/** Set only by the stage's `warming` setter, so it is cleared wherever that is (every warm-up resets it in a `finally`). */
export function setWarmingFlag(value: boolean): void {
  on = value;
}
