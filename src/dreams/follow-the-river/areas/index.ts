import { chapterOf, type Phase } from '../state';
import { CITY } from './city';
import { FOREST } from './forest';
import { SUBURBS } from './suburbs';
import type { AreaDef } from './types';

const AREAS: readonly AreaDef[] = [CITY, SUBURBS, FOREST];

/** The area whose day and night `phase` plays in (null for intro and end). */
export function areaFor(phase: Phase): AreaDef | null {
  const chapter = chapterOf(phase);
  return AREAS.find((a) => a.chapter === chapter) ?? null;
}
