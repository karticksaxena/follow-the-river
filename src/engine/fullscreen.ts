/** Full screen hides the browser bars. Needs a click or key press; failures are ignored. */
export function enterFullscreen(): void {
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen().catch(() => undefined);
}

export function toggleFullscreen(): void {
  if (!document.fullscreenElement) return enterFullscreen();
  document.exitFullscreen().catch(() => undefined);
}
