import { describe, expect, it } from 'vitest';
import { viewVisible } from './controls';

describe('viewmodels', () => {
  it('shows only the weapon in hand, and nothing during a cutscene', () => {
    expect(viewVisible('bow', 'bow', ['pistol'], false)).toBe(true);
    expect(viewVisible('pistol', 'bow', ['pistol'], false)).toBe(false);
    expect(viewVisible('bow', 'bow', ['pistol'], true)).toBe(false);
    expect(viewVisible('pistol', 'pistol', [], false)).toBe(false);
  });
});
