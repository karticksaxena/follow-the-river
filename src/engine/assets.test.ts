import { describe, expect, it } from 'vitest';
import { assetUrl } from './assets';

describe('assetUrl', () => {
  it('builds URLs under the site base path', () => {
    expect(assetUrl('river/pine.glb')).toBe(`${import.meta.env.BASE_URL}assets/river/pine.glb`);
  });
});
