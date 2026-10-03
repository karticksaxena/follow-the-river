/** One slow sleeping breath: in, a short pause, a longer sigh out, a rest. Seconds. Tuning knobs. */
export const BREATH = { inhale: 1.8, pause: 0.4, exhale: 2.4, rest: 1.2 } as const;
export const BREATH_SECONDS = BREATH.inhale + BREATH.pause + BREATH.exhale + BREATH.rest;

/** Loudness of the breath at time `t` within one cycle: silent at both ends so it loops cleanly. */
export function breathEnvelope(t: number): number {
  if (t < 0 || t >= BREATH_SECONDS) return 0;
  if (t < BREATH.inhale) return 0.55 * Math.sin((Math.PI * t) / BREATH.inhale) ** 2;
  const out = t - BREATH.inhale - BREATH.pause;
  if (out < 0 || out >= BREATH.exhale) return 0;
  return Math.sin((Math.PI * out) / BREATH.exhale) ** 2;
}

/**
 * One breath cycle of soft, airy noise (heavily smoothed so it whooshes instead of hissing),
 * shaped by `breathEnvelope`. Values stay inside -1..1.
 */
export function breathSamples(
  sampleRate: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(sampleRate * BREATH_SECONDS));
  const smoothing = Math.min(1, 900 / sampleRate);
  let air = 0;
  for (let i = 0; i < samples.length; i++) {
    air += smoothing * (random() * 2 - 1 - air);
    samples[i] = Math.max(-1, Math.min(1, air * 2.2 * breathEnvelope(i / sampleRate)));
  }
  return samples;
}

export function breathBuffer(context: BaseAudioContext): AudioBuffer {
  const samples = breathSamples(context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
