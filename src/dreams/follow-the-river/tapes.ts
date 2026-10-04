import type { DreamContext } from '../types';
import { playFlashback } from './flashback';
import { voiceFor, voiceHooks } from './voice';

export const TAPES: Readonly<Record<number, readonly string[]>> = {
  1: [
    'The label says: "Day 41. K - don\'t watch this."',
    '[Tape hiss. Mom, close to the microphone.]',
    '"Day forty-one. It ate everything we gave it again. It is growing faster than the model said it could."',
    '"Dr. Rao says the enzyme is stable. It isn\'t. Two of the test mice got out last night. They bit Arun."',
    '"He went home sick. Nobody has heard from him since."',
    '"If you\'re watching this, sweetheart… I\'m sorry. I only wanted to make something that could save the river."',
  ],
  2: [
    'The label says: "Day 63."',
    '[Tape hiss. Mom, tired, close to the microphone.]',
    '"Day sixty-three. It is so gentle, sweetheart. We started from an orca cell line, and it still grew far beyond the model."',
    '"It has learned my voice. When I sing, it comes to the glass and waits."',
    '"But the growth enzyme is the same one that went wrong in the mice."',
    '"The director buried the reports. I took the samples home, K. I\'m scared of what I\'ve done, and of being found out."',
  ],
  3: [
    'The label says: "Last tape."',
    "[Wind outside. Mom's voice is steady, but quiet.]",
    '"It started at the lab by the dam, sweetheart. It got out, and it is spreading."',
    '"I let the creature go into the river, so they couldn\'t destroy it."',
    '"It knows my voice. It will protect you, K."',
    '"But every one of them it takes, it takes the sickness too. It\'s in its blood now. I don\'t know how long it can last."',
    '"If you\'re watching this, you followed the river."',
    "\"I'll wait for you at the lake below the dam. That's where it started. I'm going to fix what I can.\"",
  ],
};

/**
 * Plays a tape: its transcript pages over an animated flashback of what Mom describes (the lab,
 * the orca in its tank, the night she set it free); each quoted line is voiced as Mom on tape.
 */
export function playTape(ctx: DreamContext, tape: number, onDone: () => void): void {
  const pages = TAPES[tape] ?? [];
  const hooks = voiceHooks(ctx.audio, (page) => voiceFor(page, 'tape'));
  if (tape === 1 || tape === 2 || tape === 3)
    void playFlashback(ctx, tape, pages, hooks).then(onDone);
  else ctx.read(pages, onDone, hooks);
}
