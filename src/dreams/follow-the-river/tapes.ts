import type * as THREE from 'three/webgpu';
import type { DreamContext } from '../types';
import type { Sounds } from './sounds';

/** Loudness of the muffled voice under the pages (tuning knob). */
const TAPE_VOLUME = 0.5;

export const TAPES: Readonly<Record<number, readonly string[]>> = {
  1: [
    'The label says: "Day 41. K — don\'t watch this."',
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
    '"If you\'re watching this, you followed the river."',
    "\"I'll wait for you at the lake below the dam. That's where it started. I'm going to fix what I can.\"",
  ],
};

let voice: THREE.Audio | null = null;

/** Stops the tape voice (also called when the chapter is torn down mid-read). */
export function stopTape(): void {
  if (!voice) return;
  if (voice.isPlaying) voice.stop();
  voice.disconnect();
  voice = null;
}

/** Plays the muffled voice on the voice channel while the transcript pages are open. */
export function playTape(
  ctx: DreamContext,
  sounds: Sounds,
  tape: number,
  onDone: () => void,
): void {
  stopTape();
  voice = ctx.audio.loop(sounds.tapeVoice, TAPE_VOLUME, 'voice', false);
  ctx.read(TAPES[tape] ?? [], () => {
    stopTape();
    onDone();
  });
}
