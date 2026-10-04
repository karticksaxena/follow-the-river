import type { SurfaceName } from '../../engine/surfaces';
import type { AreaDef } from './areas/types';

export interface GroundSurfaces {
  /** The land west of the river (the walkable strip). */
  ground: SurfaceName;
  /** The land beyond the far bank. */
  far: SurfaceName;
  /** The embankment's kerb and top (a natural bank has none). */
  kerb: SurfaceName;
}

const BY_AREA: Record<AreaDef['id'], GroundSurfaces> = {
  city: { ground: 'asphalt', far: 'asphalt', kerb: 'pavement' },
  suburbs: { ground: 'grass', far: 'grass', kerb: 'pavement' },
  forest: { ground: 'leaves', far: 'leaves', kerb: 'pavement' },
};

export const groundSurfaces = (area: AreaDef): GroundSurfaces => BY_AREA[area.id];

/**
 * The canoe ride's banks at sunrise: the pink low sun on gain 2.5 grass and mud read as snow.
 * Darken them and enrich the green and brown. Tuning knobs.
 */
export const DAWN_BANK = { gain: 0.6, saturation: 1.35 } as const;
