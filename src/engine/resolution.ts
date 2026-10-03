export interface Resolution {
  width: number;
  height: number;
}

/** Size of the low-res render target: `targetHeight` rows, width keeps the window's aspect ratio. */
export function internalResolution(
  viewWidth: number,
  viewHeight: number,
  targetHeight: number,
): Resolution {
  const height = Math.max(1, Math.min(targetHeight, Math.round(viewHeight)));
  const width = Math.max(1, Math.round((viewWidth / Math.max(1, viewHeight)) * height));
  return { width, height };
}
