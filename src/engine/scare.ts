/** How long the camera jolts after a scare, in seconds. Tuning knob. */
export const SHAKE_SECONDS = 0.6;
/** How long the light stutters after a scare, in seconds. Tuning knob. */
export const FLICKER_SECONDS = 1.2;

/** Jolt strength `elapsed` seconds after a scare: 1 at the hit, easing to 0. */
export function shakeAt(elapsed: number): number {
  if (!(elapsed >= 0) || elapsed >= SHAKE_SECONDS) return 0;
  const left = 1 - elapsed / SHAKE_SECONDS;
  return left * left;
}

/** Whether a stuttering light is on `elapsed` seconds after a scare (always on once it settles). */
export function flickerOn(elapsed: number): boolean {
  if (!(elapsed >= 0) || elapsed >= FLICKER_SECONDS) return true;
  return Math.floor(elapsed * 14) % 3 === 2;
}

/**
 * A jumpscare sting: a harsh noise burst over a low, beating drone (55 Hz against 58.3 Hz).
 * Fades out over `seconds`. Values stay inside -1..1.
 */
export function stingSamples(
  sampleRate: number,
  seconds = 1.4,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const noise = (random() * 2 - 1) * Math.exp(-t * 10);
    const drone = 0.5 * (Math.sin(2 * Math.PI * 55 * t) + Math.sin(2 * Math.PI * 58.3 * t));
    const value = (noise * 0.9 + drone * 0.6) * Math.exp(-t * 2.5);
    samples[i] = Math.max(-1, Math.min(1, value));
  }
  return samples;
}

export function stingBuffer(context: BaseAudioContext, seconds = 1.4): AudioBuffer {
  const samples = stingSamples(context.sampleRate, seconds);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
