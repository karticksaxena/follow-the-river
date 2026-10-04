import { assetUrl } from '../../engine/assets';
import type { AudioBus } from '../../engine/audio';
import { stingSamples } from '../../engine/scare';
import type { GunKind } from './state';

export interface Sounds {
  groans: AudioBuffer[];
  water: AudioBuffer;
  wind: AudioBuffer;
  night: AudioBuffer[];
  weird: AudioBuffer[];
  alarm: AudioBuffer;
  /** 8 s loop: many distant groans mixed (the "group" sound). */
  horde: AudioBuffer;
  /** The bow's release (a CC0 recording, or the generated string slap and whoosh). */
  bowShot: AudioBuffer;
  /** Each gun's shot (CC0 recordings; the generated shot if one is missing). */
  shots: Record<GunKind, AudioBuffer>;
  thud: AudioBuffer;
  /** Dras' recordings (US Fish and Wildlife, NPS, CC0). Each list is one generated fallback if its files failed to load. */
  blows: AudioBuffer[];
  splashes: AudioBuffer[];
  splashesBig: AudioBuffer[];
  /** Short calls for when she takes a zombie or a pack; empty if the files failed (no fallback voice). */
  callsShort: AudioBuffer[];
  /** Her cry when she strands and her answer to Mom's song (the generated cry if the files failed). */
  cry: AudioBuffer;
  answer: AudioBuffer;
  /** Mom's paddle strokes (empty if the files failed: she rows silently). */
  paddles: AudioBuffer[];
  /** Dawn birds (null if the file failed: only the water plays). */
  birds: AudioBuffer | null;
  sting: AudioBuffer;
  heartbeat: AudioBuffer;
  click: AudioBuffer;
  gunshot: AudioBuffer;
  dryFire: AudioBuffer;
}

const sound = (path: string): string => assetUrl(`sounds/${path}.m4a`);

export const FILES = {
  groans: Array.from({ length: 24 }, (_, i) =>
    sound(`zombie/groan-${String(i + 1).padStart(2, '0')}`),
  ),
  water: sound('ambience/water'),
  wind: sound('ambience/wind'),
  night: [1, 2, 3].map((n) => sound(`ambience/night-${n}`)),
  weird: [1, 2, 3].map((n) => sound(`stings/weird-${n}`)),
  alarm: sound('stings/alarm'),
  weapons: {
    pistol: sound('weapons/pistol'),
    shotgun: sound('weapons/shotgun'),
    rifle: sound('weapons/rifle'),
    bow: sound('weapons/bow'),
  },
  dras: {
    cry: sound('dras/call-cry'),
    answer: sound('dras/call-answer'),
    blows: [1, 2, 3, 4].map((n) => sound(`dras/blow-${n}`)),
    splashes: [1, 2, 3].map((n) => sound(`dras/splash-small-${n}`)),
    splashesBig: [1, 2, 3].map((n) => sound(`dras/splash-big-${n}`)),
    callsShort: [1, 2, 3].map((n) => sound(`dras/call-short-${n}`)),
  },
  paddles: [1, 2, 3, 4].map((n) => sound(`canoe/paddle-${n}`)),
  birds: sound('ambience/birds'),
} as const;

/** Length and loudness of the horde layer. Tuning knobs. */
const HORDE_SECONDS = 8;
const HORDE_COUNT = 14;

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
const onePole = (hz: number, rate: number): number => 1 - Math.exp((-2 * Math.PI * hz) / rate);

/**
 * A bow shot: the string's dull slap (a 90 Hz thump and a short mid-band snap, gone in ~60 ms),
 * then the arrow's whoosh: band-passed noise whose band falls as it flies away.
 */
export function bowShotSamples(rate: number, random: () => number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * 0.45));
  const snapHigh = onePole(1400, rate);
  const snapLow = onePole(250, rate);
  const airLow = onePole(500, rate);
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const noise = random() * 2 - 1;
    a += snapHigh * (noise - a);
    b += snapLow * (noise - b);
    c += onePole(2600 * Math.exp(-t * 3) + 700, rate) * (noise - c);
    d += airLow * (noise - d);
    const thump = Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 45) * 0.7;
    const snap = (a - b) * 2.2 * Math.exp(-t * 70);
    const fade = 1 - i / samples.length; // 0 at the end: no click
    const whoosh = (c - d) * 1.2 * Math.min(1, t / 0.03) * Math.exp(-t * 6) * fade;
    samples[i] = clamp(thump + snap + whoosh);
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

/**
 * A closure that returns a random item from `list`, never the same one twice in a row (no
 * allocation per call). Null for an empty list.
 */
export function picker<T>(list: readonly T[], random: () => number = Math.random): () => T | null {
  let last = -1;
  return () => {
    if (list.length === 0) return null;
    let i = 0;
    if (list.length > 1) {
      i = Math.floor(random() * (list.length - 1));
      if (i >= last && last >= 0) i++; // skips `last`
    }
    last = i;
    return list[i] ?? null;
  };
}

/** A playback rate in `[lo, hi)` from `random`. */
export const rateIn = (lo: number, hi: number, random: () => number = Math.random): number =>
  lo + (hi - lo) * random();

/** Loads every url; if any fails the whole list is `fallback` (so real and generated sounds never mix). */
export async function loadOr<B, T>(
  audio: { load(url: string): Promise<B> },
  urls: readonly string[],
  fallback: T[],
): Promise<Array<B | T>> {
  try {
    return await Promise.all(urls.map((u) => audio.load(u)));
  } catch {
    return fallback;
  }
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

type DrasSounds = Pick<
  Sounds,
  'blows' | 'splashes' | 'splashesBig' | 'callsShort' | 'cry' | 'answer'
>;

/** Dras' sounds, the paddles and the birds. Generated sounds stand in only for files that fail. */
async function loadDras(
  audio: AudioBus,
): Promise<{ dras: DrasSounds; paddles: AudioBuffer[]; birds: AudioBuffer | null }> {
  const context = audio.listener.context;
  const rate = context.sampleRate;
  const { dras } = FILES;
  const cryFallback = toBuffer(context, orcaCrySamples(rate, 2.5, Math.random));
  const blowFallback = toBuffer(context, blowSamples(rate, 0.6, Math.random));
  const splashFallback = toBuffer(context, splashSamples(rate, 0.8, Math.random));
  const [blows, splashes, splashesBig, callsShort, cry, answer, paddles, birds] = await Promise.all(
    [
      loadOr(audio, dras.blows, [blowFallback]),
      loadOr(audio, dras.splashes, [splashFallback]),
      loadOr(audio, dras.splashesBig, [splashFallback]),
      loadOr(audio, dras.callsShort, []),
      loadOr(audio, [dras.cry], [cryFallback]),
      loadOr(audio, [dras.answer], [cryFallback]),
      loadOr(audio, FILES.paddles, []),
      loadOr(audio, [FILES.birds], []),
    ],
  );
  return {
    dras: {
      blows,
      splashes,
      splashesBig,
      callsShort,
      cry: cry[0] ?? cryFallback,
      answer: answer[0] ?? cryFallback,
    },
    paddles,
    birds: birds[0] ?? null,
  };
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
  // Weapon recordings are optional: a missing one falls back to a generated sound.
  const gunshot = toBuffer(context, gunshotSamples(rate, Math.random));
  const or = (url: string, fallback: AudioBuffer): Promise<AudioBuffer> =>
    audio.load(url).catch(() => fallback);
  const { weapons } = FILES;
  const [pistol, shotgun, rifle, bowShot] = await Promise.all([
    or(weapons.pistol, gunshot),
    or(weapons.shotgun, gunshot),
    or(weapons.rifle, gunshot),
    or(weapons.bow, toBuffer(context, bowShotSamples(rate, Math.random))),
  ]);
  const { dras, paddles, birds } = await loadDras(audio);
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
    bowShot,
    shots: { pistol, shotgun, rifle },
    thud: toBuffer(context, thudSamples(rate)),
    ...dras,
    paddles,
    birds,
    sting: toBuffer(context, stingSamples(rate)),
    heartbeat: toBuffer(context, heartbeatSamples(rate)),
    click: toBuffer(context, clickSamples(rate, Math.random)),
    gunshot,
    dryFire: toBuffer(context, dryFireSamples(rate, Math.random)),
  };
}
