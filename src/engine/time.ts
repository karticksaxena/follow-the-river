/** Longest step the game advances in one frame, in seconds. Tab switches can report gaps of minutes. */
export const MAX_FRAME_SECONDS = 0.1;

export function clampDelta(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_FRAME_SECONDS);
}
