import { describe, expect, it } from 'vitest';
import { ZZZ, zzzFrame } from './zzz';

describe('zzzFrame', () => {
  it('is born invisible at the head', () => {
    expect(zzzFrame(0)).toMatchObject({ rise: 0, opacity: 0 });
  });

  it('is fully visible shortly after birth', () => {
    expect(zzzFrame(0.15).opacity).toBeCloseTo(1);
  });

  it('ends invisible at the top of its rise', () => {
    const end = zzzFrame(1);
    expect(end.opacity).toBeCloseTo(0);
    expect(end.rise).toBeCloseTo(ZZZ.rise);
  });

  it('always rises and grows over time', () => {
    expect(zzzFrame(0.6).rise).toBeGreaterThan(zzzFrame(0.3).rise);
    expect(zzzFrame(0.6).scale).toBeGreaterThan(zzzFrame(0.3).scale);
  });
});
