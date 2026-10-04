import { describe, expect, it } from 'vitest';
import { cutsceneChange, viewVisible } from './controls';

describe('viewmodels', () => {
  it('shows only the weapon in hand, and nothing during a cutscene', () => {
    expect(viewVisible('bow', 'bow', ['pistol'], false)).toBe(true);
    expect(viewVisible('pistol', 'bow', ['pistol'], false)).toBe(false);
    expect(viewVisible('bow', 'bow', ['pistol'], true)).toBe(false);
    expect(viewVisible('pistol', 'pistol', [], false)).toBe(false);
  });
});

describe('cutsceneChange', () => {
  it('enters, leaves, and a phase reset in between never leaves', () => {
    expect(cutsceneChange(false, true)).toBe('enter');
    expect(cutsceneChange(true, false)).toBe('leave');
    expect(cutsceneChange(true, true)).toBeNull();
    // reset() sets the seen flag to false while beginPhase already cleared run.cutscene
    expect(cutsceneChange(false, false)).toBeNull();
  });
});
