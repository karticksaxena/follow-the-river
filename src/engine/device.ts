export type MediaQuery = (query: string) => { matches: boolean };

/** Desktop = the main pointer is precise and can hover (mouse or trackpad). Touch-only devices fail. */
export function isDesktop(matchMedia: MediaQuery): boolean {
  return matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches;
}
