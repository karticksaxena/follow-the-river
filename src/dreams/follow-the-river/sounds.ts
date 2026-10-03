import { assetUrl } from '../../engine/assets';
import type { AudioBus } from '../../engine/audio';
import { stingSamples } from '../../engine/scare';

export interface Sounds {
  groans: AudioBuffer[];
  water: AudioBuffer;
  wind: AudioBuffer;
  night: AudioBuffer[];
  weird: AudioBuffer[];
  alarm: AudioBuffer;
  /** 8 s loop: many distant groans mixed (the "group" sound). */
  horde: AudioBuffer;
  twang: AudioBuffer;
  thud: AudioBuffer;
  splash: AudioBuffer;
  sting: AudioBuffer;
  heartbeat: AudioBuffer;
  tapeVoice: AudioBuffer;
  click: AudioBuffer;
}

const sound = (path: string): string => assetUrl(`sounds/${path}.m4a`);

const FILES = {
  groans: Array.from({ length: 24 }, (_, i) =>
    sound(`zombie/groan-${String(i + 1).padStart(2, '0')}`),
  ),
  water: sound('ambience/water'),
  wind: sound('ambience/wind'),
  night: [1, 2, 3].map((n) => sound(`ambience/night-${n}`)),
  weird: [1, 2, 3].map((n) => sound(`stings/weird-${n}`)),
  alarm: sound('stings/alarm'),
} as const;

/** Length and loudness of the horde layer. Tuning knobs. */
const HORDE_SECONDS = 8;
const HORDE_COUNT = 14;

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
const onePole = (hz: number, rate: number): number => 1 - Math.exp((-2 * Math.PI * hz) / rate);

/** Karplus–Strong plucked string: a noise-filled delay line, averaged and damped, then faded. */
export function pluckSamples(
  rate: number,
  frequency: number,
  seconds: number,
  random: () => number,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds));
  const line = new Float32Array(Math.max(2, Math.round(rate / frequency)));
  for (let i = 0; i < line.length; i++) line[i] = random() * 2 - 1;
  let at = 0;
  for (let i = 0; i < samples.length; i++) {
    const next = (at + 1) % line.length;
    const out = line[at] ?? 0;
    line[at] = 0.996 * 0.5 * (out + (line[next] ?? 0));
    at = next;
    samples[i] = clamp(out * Math.exp(-(i / rate) * 4));
  }
  return samples;
}

/** Water slap: noise through a low-pass whose cutoff falls, 30 ms attack, exp(-5t) decay. */
export function splashSamples(
  rate: number,
  seconds: number,
  random: () => number,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds));
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    low += onePole(3000 * Math.exp(-t * 4) + 300, rate) * (random() * 2 - 1 - low);
    const attack = Math.min(1, t / 0.03);
    samples[i] = clamp(low * 3 * attack * Math.exp(-t * 5));
  }
  return samples;
}

/** Arrow hitting something soft: a 70 Hz body with a 5 ms click. */
export function thudSamples(rate: number): Float32Array<ArrayBuffer> {
  // 60 ms of body, then silence to 0.12 s (the test requires > 0.1 s of buffer)
  const samples = new Float32Array(Math.floor(rate * 0.12));
  for (let i = 0; i < Math.min(samples.length, Math.floor(rate * 0.06)); i++) {
    const t = i / rate;
    const click = t < 0.005 ? Math.sin(i * 12.9898) * 0.5 : 0;
    samples[i] = clamp(Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 40) + click);
  }
  return samples;
}

/** Lub-dub: two 50 Hz thumps 0.18 s apart in a 0.9 s buffer (looped while hurt). */
export function heartbeatSamples(rate: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * 0.9));
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const thump = (start: number, gain: number): number =>
      t < start ? 0 : gain * Math.sin(2 * Math.PI * 50 * (t - start)) * Math.exp(-(t - start) * 18);
    samples[i] = clamp(thump(0, 0.9) + thump(0.18, 0.7));
  }
  return samples;
}

/** Mom on a worn tape: muffled syllable bursts (band-passed noise at ~4 Hz), hiss and wow. */
export function tapeVoiceSamples(
  rate: number,
  seconds: number,
  random: () => number,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds));
  const fast = onePole(1200, rate);
  const slow = onePole(300, rate);
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const noise = random() * 2 - 1;
    hi += fast * (noise - hi);
    lo += slow * (noise - lo);
    const syllable =
      Math.max(0, Math.sin(2 * Math.PI * 3.7 * t + 2 * Math.sin(2 * Math.PI * 0.7 * t))) ** 2;
    const wow = 0.95 + 0.05 * Math.sin(2 * Math.PI * 0.5 * t);
    samples[i] = clamp(((hi - lo) * 6 * syllable + noise * 0.04) * wow);
  }
  return samples;
}

/** A 25 ms filtered noise tick for UI clicks. */
export function clickSamples(rate: number, random: () => number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.round(rate * 0.025));
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    low += 0.5 * (random() * 2 - 1 - low);
    samples[i] = clamp(low * 1.5 * Math.exp(-(i / rate) * 120));
  }
  return samples;
}

/** Overlaps `count` groans at random offsets and gains, low-passed, normalised to a 0.8 peak. */
export function mixHorde(
  rate: number,
  groans: readonly Float32Array[],
  seconds: number,
  count: number,
  random: () => number,
): Float32Array<ArrayBuffer> {
  const mix = new Float32Array(Math.floor(rate * seconds));
  if (groans.length === 0 || mix.length === 0) return mix;
  for (let n = 0; n < count; n++) {
    const groan = groans[Math.floor(random() * groans.length)] ?? groans[0] ?? mix;
    const offset = Math.floor(random() * mix.length);
    const gain = 0.3 + random() * 0.4;
    for (let i = 0; i < groan.length; i++) {
      const at = (offset + i) % mix.length; // wraps, so the loop is seamless
      mix[at] = (mix[at] ?? 0) + (groan[i] ?? 0) * gain;
    }
  }
  const smoothing = onePole(900, rate);
  // Warm the filter up on the whole loop first, so its state at the start matches the end: no click.
  let low = 0;
  for (let i = 0; i < mix.length; i++) low += smoothing * ((mix[i] ?? 0) - low);
  let top = 0;
  for (let i = 0; i < mix.length; i++) {
    low += smoothing * ((mix[i] ?? 0) - low);
    mix[i] = low;
    top = Math.max(top, Math.abs(low));
  }
  if (top > 0) for (let i = 0; i < mix.length; i++) mix[i] = clamp(((mix[i] ?? 0) / top) * 0.8);
  return mix;
}

function toBuffer(context: BaseAudioContext, samples: Float32Array<ArrayBuffer>): AudioBuffer {
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

export async function loadSounds(audio: AudioBus): Promise<Sounds> {
  const load = (urls: readonly string[]): Promise<AudioBuffer[]> =>
    Promise.all(urls.map((u) => audio.load(u)));
  const [groans, [water], [wind], night, weird, [alarm]] = await Promise.all([
    load(FILES.groans),
    load([FILES.water]),
    load([FILES.wind]),
    load(FILES.night),
    load(FILES.weird),
    load([FILES.alarm]),
  ]);
  if (!water || !wind || !alarm) throw new Error('Missing ambience sounds');
  const context = audio.listener.context;
  const rate = context.sampleRate;
  const horde = mixHorde(
    rate,
    groans.map((g) => g.getChannelData(0)),
    HORDE_SECONDS,
    HORDE_COUNT,
    Math.random,
  );
  return {
    groans,
    water,
    wind,
    night,
    weird,
    alarm,
    horde: toBuffer(context, horde),
    twang: toBuffer(context, pluckSamples(rate, 110, 0.8, Math.random)),
    thud: toBuffer(context, thudSamples(rate)),
    splash: toBuffer(context, splashSamples(rate, 0.8, Math.random)),
    sting: toBuffer(context, stingSamples(rate)),
    heartbeat: toBuffer(context, heartbeatSamples(rate)),
    tapeVoice: toBuffer(context, tapeVoiceSamples(rate, 6, Math.random)),
    click: toBuffer(context, clickSamples(rate, Math.random)),
  };
}
