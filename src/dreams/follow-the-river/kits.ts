import { assetUrl } from '../../engine/assets';

export type Kit = 'city' | 'roads' | 'cars' | 'survival' | 'suburb' | 'nature' | 'megakit';

/**
 * Kenney kits come in tiny native units; these scale each to metres. Tuning knobs.
 * Nature kit (flat colours, no textures): ×5 gives ~7.5 m pines; scale crops (~0.35) and
 * stumps/bushes (~0.5) down per prop with `PropPlacement.scale`.
 */
export const KIT_SCALE: Readonly<Record<Kit, number>> = {
  city: 10,
  roads: 6,
  cars: 1,
  survival: 6,
  suburb: 8,
  nature: 5,
  // Quaternius' MegaKit is modelled in metres (a Pine is 7.3 m): its category GLBs are
  // instanced by `nature.ts`, never loaded through `kitUrl`.
  megakit: 1,
};

/** Each kit has its own folder: their `Textures/colormap.png` files differ. */
export function kitUrl(kit: Kit, model: string): string {
  return assetUrl(`kits/${kit}/${model}.glb`);
}

export function propUrl(name: string): string {
  return assetUrl(`props/${name}.glb`);
}

export function characterUrl(
  name: 'mom' | 'kartik' | 'kartik-arm' | 'zombie-m' | 'zombie-f' | 'orca',
): string {
  return assetUrl(`characters/${name}.glb`);
}
