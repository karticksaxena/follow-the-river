import { describe, expect, it } from 'vitest';
import { babbleSamples, contourScale, introVoice, voiceFor } from './voice';

const RATE = 8000;
const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('babbleSamples', () => {
  it('is deterministic per text and differs between texts', () => {
    const a = babbleSamples('Mom: "It is you."', 'mom', RATE);
    expect(babbleSamples('Mom: "It is you."', 'mom', RATE)).toEqual(a);
    expect(babbleSamples('Mom: "It is not."', 'mom', RATE)).not.toEqual(a);
  });

  it('scales with text length and caps at 4 s', () => {
    const short = babbleSamples('Hello there.', 'anchor', RATE).length;
    const long = babbleSamples('Hello there. '.repeat(4), 'anchor', RATE).length;
    const huge = babbleSamples('Hello there. '.repeat(80), 'anchor', RATE).length;
    expect(long).toBeGreaterThan(short);
    expect(huge).toBeLessThanOrEqual(RATE * 4);
  });

  it.each(['mom', 'anchor', 'tape'] as const)('%s is audible, in range and click-free', (voice) => {
    const s = babbleSamples('"Day forty-one. It ate everything, again?"', voice, RATE);
    expect(peak(s)).toBeGreaterThan(0.1);
    expect(peak(s)).toBeLessThanOrEqual(0.9);
    const edge = Math.floor(RATE * 0.005);
    expect(peak(s.subarray(0, edge))).toBeLessThan(0.05);
    expect(peak(s.subarray(s.length - edge))).toBeLessThan(0.05);
  });

  it('falls at a period and rises at a question mark', () => {
    expect(contourScale('Wait.', 1)).toBeLessThan(1);
    expect(contourScale('Wait?', 1)).toBeGreaterThan(1);
    expect(contourScale('Wait.', 0)).toBeCloseTo(1, 1);
  });
});

describe('voiceFor', () => {
  it('maps Mom lines, TV lines, tape lines and narration', () => {
    expect(voiceFor('Mom: "Hello."', 'scene')).toBe('mom');
    expect(voiceFor('BREAKING NEWS: something', 'tv')).toBe('anchor');
    expect(voiceFor('"Stay indoors."', 'tv')).toBe('anchor');
    expect(voiceFor('"Day forty-one."', 'tape')).toBe('tape');
    expect(voiceFor('The label says: "Day 41."', 'tape')).toBeNull();
    expect(voiceFor('[Tape hiss. Mom, close.]', 'tape')).toBeNull();
    expect(voiceFor('You are alive.', 'scene')).toBeNull();
    expect(voiceFor('"Quoted narration."', 'scene')).toBeNull();
  });

  it('introVoice treats quoted lines as the anchor', () => {
    expect(introVoice('"Stay inside."')).toBe('anchor');
    expect(introVoice('Mom: "Come here."')).toBe('mom');
    expect(introVoice('Night falls.')).toBeNull();
  });
});
