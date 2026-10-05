import type { DreamContext } from '../types';
import { playFlashback } from './flashback';
import type { VoiceName } from './voice';
import { prepareVoices, voiceFor, voiceHooks } from './voice';

export const TAPES: Readonly<Record<number, readonly string[]>> = {
  1: [
    'The label says: "Day 12. For Kartik, when he is older."',
    '[Tape hiss. Water lapping against glass. Mom, close to the microphone.]',
    '"Day twelve. The board calls her Subject R-7. We grew her from an orca cell line and changed her, cell by cell, so she can live in fresh water."',
    '"She was made to clean the river. She eats what the factories leave in it, and the water comes out clear."',
    '"She comes to the glass when I sing. Every single time."',
    '"I am not calling her R-7. Her name is Dras."',
    '"Kartik, if you ever meet her, she is gentle. She is ours."',
  ],
  2: [
    'The label says: "Day 41. Kartik, don\'t watch this."',
    '[Tape hiss. Mom, tired, close to the microphone.]',
    '"Day forty-one. Dras eats everything we give her. She is growing faster than the model said she could."',
    '"Dr. Rao says the growth enzyme is stable. It isn\'t. Two of the test mice got out last night. They bit Arun."',
    '"He went home sick. Nobody has heard from him since."',
    '"The director buried the reports. I took the samples home, Kartik. I\'m scared of what I\'ve done, and of being found out."',
    '"If you\'re watching this, sweetheart… I\'m sorry. I only wanted to make something that could save the river."',
  ],
  3: [
    'The label says: "Last tape."',
    "[Wind outside. Mom's voice is steady, but quiet.]",
    '"It started at the lab by the dam, sweetheart. It got out, and it is spreading."',
    '"I let Dras go into the river, so they couldn\'t destroy her."',
    '"She knows my voice. She will protect you, Kartik."',
    '"But every one of them she takes, she takes the sickness too. It\'s in her blood now. I don\'t know how long she can last."',
    '"If you\'re watching this, you followed the river."',
    "\"I'll wait for you at the lake below the dam. That's where it started. I'm going to fix what I can.\"",
  ],
};

const pick = (page: string): VoiceName | null => voiceFor(page, 'tape');

/**
 * Plays a tape: its transcript pages over an animated flashback of what Mom describes (the lab,
 * the orca in its tank, the night she set it free); each quoted line is voiced as Mom on tape.
 */
export function playTape(ctx: DreamContext, tape: number, onDone: () => void): void {
  const pages = TAPES[tape] ?? [];
  const hooks = voiceHooks(ctx.audio, pick);
  const prepare = (): void => prepareVoices(ctx.audio, pages, pick);
  if (tape === 1 || tape === 2 || tape === 3)
    void playFlashback(ctx, tape, pages, hooks, prepare).then(onDone);
  else {
    prepare();
    ctx.read(pages, onDone, hooks);
  }
}
