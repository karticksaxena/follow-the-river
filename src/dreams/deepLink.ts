import type { DreamInfo } from './types';

/** The dream named by `?dream=<id>`, or null when the id is missing or unknown. */
export function dreamFromSearch(search: string, dreams: readonly DreamInfo[]): DreamInfo | null {
  const id = new URLSearchParams(search).get('dream');
  return dreams.find((d) => d.id === id) ?? null;
}
