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
  /** The orca's breath at the surface (0.6 s). */
  blow: AudioBuffer;
  sting: AudioBuffer;
  heartbeat: AudioBuffer;
  click: AudioBuffer;
  gunshot: AudioBuffer;
  dryFire: AudioBuffer;
  /** The orca's sad cry (2.5 s). */
  orcaCry: AudioBuffer;
  /** 12 s seamless pad for the ending. */
  dawn: AudioBuffer;
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

/** The orca's breath: 0.6 s of band-passed noise (300 Hz to 2.2 kHz) swelling and fading to silence. */
export function blowSamples(
  rate: number,
  seconds: number,
  random: () => number,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds));
  const high = onePole(2200, rate);
  const low = onePole(300, rate);
  let a = 0;
  let b = 0;
  for (let i = 0; i < samples.length; i++) {
    const noise = random() * 2 - 1;
    a += high * (noise - a);
    b += low * (noise - b);
    const swell = Math.sin((Math.PI * i) / samples.length) ** 2; // 0 at both ends: no click
    samples[i] = clamp((a - b) * 4 * swell);
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

/** Pistol shot: a bright noise crack (fast decay) over a 60 Hz thump, 0.6 s. */
export function gunshotSamples(rate: number, random: () => number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * 0.6));
  let low = 0;
  const smoothing = onePole(5000, rate);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    low += smoothing * (random() * 2 - 1 - low);
    const crack = low * 2 * Math.exp(-t * 28);
    const tail = low * 0.4 * Math.exp(-t * 6);
    const thump = Math.sin(2 * Math.PI * 60 * t) * 0.9 * Math.exp(-t * 10);
    samples[i] = clamp((crack + tail + thump) * Math.min(1, t / 0.001));
  }
  return samples;
}

/** Empty chamber: a dry 40 ms click with a 2.4 kHz ping. */
export function dryFireSamples(rate: number, random: () => number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.round(rate * 0.04));
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const noise = (random() * 2 - 1) * Math.exp(-t * 300);
    const ping = Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 150) * 0.6;
    samples[i] = clamp(noise * 0.8 + ping);
  }
  return samples;
}

/** The orca's cry: a sine sweeping 220 → 140 Hz with slow vibrato, breath noise, soft fade in and out. */
export function orcaCrySamples(
  rate: number,
  seconds: number,
  random: () => number,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds));
  const smoothing = onePole(600, rate);
  let phase = 0;
  let breath = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const progress = t / seconds;
    const vibrato = 1 + 0.03 * Math.sin(2 * Math.PI * 4 * t);
    phase += (2 * Math.PI * (220 - 80 * progress) * vibrato) / rate;
    breath += smoothing * (random() * 2 - 1 - breath);
    const fade = Math.sin(Math.PI * progress) ** 1.5;
    samples[i] = clamp((Math.sin(phase) * 0.6 + breath * 0.25) * fade);
  }
  return samples;
}

/** Notes (Hz) of the dawn chord: C major spread over three octaves. */
const DAWN_NOTES = [65.41, 130.81, 196, 261.63, 329.63, 392] as const;

/**
 * Dawn: a soft major-chord pad that swells in slowly. Every note is rounded to a whole number of
 * cycles in the buffer and the swell is periodic, so the loop has no seam.
 */
export function dawnSamples(rate: number, seconds: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds));
  const whole = DAWN_NOTES.map((f) => Math.max(1, Math.round(f * seconds)) / seconds);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const swell = 0.4 + 0.6 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / seconds));
    let sum = 0;
    for (const f of whole) {
      sum += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * (f + 1 / seconds) * t);
    }
    samples[i] = clamp((sum / (whole.length * 1.5)) * 1.2 * swell);
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
    blow: toBuffer(context, blowSamples(rate, 0.6, Math.random)),
    sting: toBuffer(context, stingSamples(rate)),
    heartbeat: toBuffer(context, heartbeatSamples(rate)),
    click: toBuffer(context, clickSamples(rate, Math.random)),
    gunshot: toBuffer(context, gunshotSamples(rate, Math.random)),
    dryFire: toBuffer(context, dryFireSamples(rate, Math.random)),
    orcaCry: toBuffer(context, orcaCrySamples(rate, 2.5, Math.random)),
    dawn: toBuffer(context, dawnSamples(rate, 12)),
  };
}
