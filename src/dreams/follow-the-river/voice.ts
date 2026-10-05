import type { AudioBus } from '../../engine/audio';
import type { PageHooks } from '../../engine/menus';

export type VoiceName = 'mom' | 'anchor' | 'tape';
export type VoiceContext = 'tv' | 'tape' | 'scene';

interface VoiceDef {
  /** Pitch (Hz). */
  f0: number;
  /** Pitch tremble: depth (fraction of f0) and rate (Hz). */
  tremble: number;
  trembleHz: number;
  /** Scales the vowel formants (a smaller throat is brighter). */
  formants: number;
  /** One-pole band edges (Hz): the sound is high-passed at `low` and low-passed at `high`. */
  low: number;
  high: number;
  /** Hiss level (0..1) and slow tape wow depth. */
  hiss: number;
  wow: number;
  /** Playback volume (dim, never harsh). */
  volume: number;
}

/** Tuning knobs. */
const VOICES: Readonly<Record<VoiceName, VoiceDef>> = {
  mom: {
    f0: 210,
    tremble: 0.025,
    trembleHz: 5.5,
    formants: 1.1,
    low: 80,
    high: 4200,
    hiss: 0,
    wow: 0,
    volume: 0.45,
  },
  anchor: {
    f0: 120,
    tremble: 0.004,
    trembleHz: 4,
    formants: 0.92,
    low: 320,
    high: 3400,
    hiss: 0.02,
    wow: 0,
    volume: 0.35,
  },
  tape: {
    f0: 210,
    tremble: 0.02,
    trembleHz: 5,
    formants: 1.1,
    low: 150,
    high: 1500,
    hiss: 0.05,
    wow: 0.03,
    volume: 0.45,
  },
};

/** Seconds of voice per character, and the longest line. */
const SECONDS_PER_CHAR = 0.07;
const MAX_SECONDS = 4;
const MIN_SECONDS = 0.3;
const PEAK = 0.8;
const FADE = 0.02;
const STOP_FADE = 0.015;
const STOP_AFTER = 0.08;

/** Formants (Hz) of a, e, i, o, u. */
const VOWELS: readonly (readonly [number, number, number])[] = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
];
const BANDWIDTH = 90;

/** Pitch multiplier at `progress` (0..1) through the line: falls at a period, rises at a "?". */
export function contourScale(text: string, progress: number): number {
  const end = text
    .trimEnd()
    .replace(/["')\]]+$/, '')
    .slice(-1);
  const tail = Math.max(0, (progress - 0.6) / 0.4);
  if (end === '?') return 1 + 0.25 * tail;
  if (end === '.' || end === '!') return 1 - 0.15 * tail;
  return 1;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seededRandom(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Timeline unit: a syllable (vowel index) or a pause; `weight` is its share of the line. */
interface Unit {
  vowel: number;
  weight: number;
}

function units(text: string, random: () => number): Unit[] {
  const out: Unit[] = [];
  for (const word of text.split(/\s+/)) {
    const letters = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (letters.length === 0) continue;
    const syllables = Math.min(3, Math.ceil(letters.length / 4));
    for (let i = 0; i < syllables; i++) {
      out.push({ vowel: Math.floor(random() * VOWELS.length), weight: 1 });
    }
    const end = word.slice(-1);
    if (/[.!?]/.test(end)) out.push({ vowel: -1, weight: 1.6 });
    else if (/[,;:—]/.test(end)) out.push({ vowel: -1, weight: 0.8 });
    else out.push({ vowel: -1, weight: 0.15 });
  }
  return out;
}

const onePole = (hz: number, rate: number): number => 1 - Math.exp((-2 * Math.PI * hz) / rate);

/** Three two-pole resonators for one vowel: [a1, a2, gain] per formant. */
function resonators(vowel: number, scale: number, rate: number): number[][] {
  return (VOWELS[vowel] ?? VOWELS[0] ?? []).map((f, k) => {
    const hz = Math.min(f * scale, rate * 0.45);
    const r = Math.exp((-Math.PI * BANDWIDTH * (1 + k)) / rate);
    return [2 * r * Math.cos((2 * Math.PI * hz) / rate), -r * r, (1 - r) * (k === 0 ? 1 : 0.6)];
  });
}

/**
 * One wordless vocal line for a page: a glottal saw through vowel formants, one syllable per
 * word (up to three), pauses at punctuation, a pitch contour, then the voice's own colouring.
 * Pure and deterministic per text. About 0.07 s per character, at most 4 s.
 */
export function babbleSamples(
  text: string,
  voice: VoiceName,
  rate: number,
): Float32Array<ArrayBuffer> {
  const def = VOICES[voice];
  const random = seededRandom(hash(text));
  const seconds = Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, text.length * SECONDS_PER_CHAR));
  const out = new Float32Array(Math.floor(rate * seconds));
  const list = units(text, random);
  const total = list.reduce((sum, u) => sum + u.weight, 0) || 1;
  const noise = seededRandom(hash(text) ^ 0x9e3779b9);
  const high = onePole(def.high, rate);
  const low = onePole(def.low, rate);
  let phase = 0;
  let at = 0;
  const y1 = [0, 0, 0];
  const y2 = [0, 0, 0];
  let lp = 0;
  let hp = 0;
  for (const unit of list) {
    const span = Math.floor((unit.weight / total) * out.length);
    const bank = unit.vowel >= 0 ? resonators(unit.vowel, def.formants, rate) : [];
    for (let i = 0; i < span && at < out.length; i++, at++) {
      const t = at / rate;
      const f =
        def.f0 *
        contourScale(text, at / out.length) *
        (1 + def.tremble * Math.sin(2 * Math.PI * def.trembleHz * t)) *
        (1 + def.wow * Math.sin(2 * Math.PI * 0.6 * t));
      phase = (phase + f / rate) % 1;
      const env = Math.sin((Math.PI * i) / span) ** 2; // 0 at both ends: no click
      let voiced = 0;
      for (let k = 0; k < bank.length; k++) {
        const [a1 = 0, a2 = 0, g = 0] = bank[k] ?? [];
        const y = g * (phase * 2 - 1) + a1 * (y1[k] ?? 0) + a2 * (y2[k] ?? 0);
        y2[k] = y1[k] ?? 0;
        y1[k] = y;
        voiced += y;
      }
      const x = voiced * env * (0.8 + 0.2 * Math.sin(2 * Math.PI * 1.7 * t));
      lp += high * (x - lp);
      hp += low * (lp - hp);
      out[at] = lp - hp + (noise() * 2 - 1) * def.hiss;
    }
  }
  return finish(out, rate);
}

/** Fades both ends (no clicks) and normalises to PEAK. */
function finish(out: Float32Array<ArrayBuffer>, rate: number): Float32Array<ArrayBuffer> {
  const fade = Math.min(Math.floor(rate * FADE), out.length >> 1);
  let top = 0;
  for (let i = 0; i < out.length; i++) {
    const g = Math.min(1, i / fade, (out.length - 1 - i) / fade);
    out[i] = (out[i] ?? 0) * g;
    top = Math.max(top, Math.abs(out[i] ?? 0));
  }
  if (top > 0) for (let i = 0; i < out.length; i++) out[i] = ((out[i] ?? 0) / top) * PEAK;
  return out;
}

/** Which voice speaks `page`: Mom lines, TV and tape lines in quotes; narration is silent. */
export function voiceFor(page: string, context: VoiceContext): VoiceName | null {
  if (page.startsWith('Mom:')) return 'mom';
  if (page.startsWith('BREAKING NEWS')) return 'anchor';
  if (!page.startsWith('"')) return null;
  if (context === 'tv') return 'anchor';
  return context === 'tape' ? 'tape' : null;
}

/** The intro's pages: Mom, and quoted lines are the TV anchor. */
export const introVoice = (page: string): VoiceName | null => voiceFor(page, 'tv');

interface Playing {
  stop(): unknown;
  isPlaying: boolean;
  gain: GainNode;
  source: AudioNode | null;
}
let playing: Playing | null = null;
const cache = new Map<string, AudioBuffer>();

/** Fades the current line out and stops it (page change, close, quit). Safe to call any time. */
export function stopVoice(): void {
  const sound = playing;
  playing = null;
  if (!sound?.isPlaying) return;
  const now = sound.gain.context.currentTime;
  sound.gain.gain.cancelScheduledValues(now);
  sound.gain.gain.setTargetAtTime(0, now, STOP_FADE);
  if (sound.source instanceof AudioBufferSourceNode) sound.source.stop(now + STOP_AFTER);
}

function buffered(audio: AudioBus, page: string, voice: VoiceName): AudioBuffer {
  const context = audio.listener.context;
  const key = `${voice}|${page}`;
  let buffer = cache.get(key);
  if (!buffer) {
    const samples = babbleSamples(page, voice, context.sampleRate);
    buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    cache.set(key, buffer);
  }
  return buffer;
}

function speak(audio: AudioBus, page: string, voice: VoiceName): void {
  playing = audio.once(buffered(audio, page, voice), VOICES[voice].volume, 'voice');
}

/** Synthesizes the voiced lines of `pages` now (behind black / a loader) so no page pays for it when it opens. */
export function prepareVoices(
  audio: AudioBus,
  pages: readonly string[],
  pick: (page: string) => VoiceName | null,
): void {
  for (const page of pages) {
    const voice = pick(page);
    if (voice) buffered(audio, page, voice);
  }
}

/** Pager hooks for `ctx.read`: speaks each page in the voice `pick` chooses, stops on change and close. */
export function voiceHooks(
  audio: AudioBus,
  pick: (page: string) => VoiceName | null,
): Required<PageHooks> {
  return {
    onPage(page) {
      stopVoice();
      const voice = pick(page);
      if (voice) speak(audio, page, voice);
    },
    onClose: () => stopVoice(),
  };
}
