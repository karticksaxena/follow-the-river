/** Tuning knobs (seconds, metres, m/s). The ride runs until Mom stops rowing, then the closing pages and the end shot. */
export const RIDE = {
  seconds: 72,
  speed: 2.4,
  /** Push-off: the canoe eases up to full speed over this long. */
  easeIn: 3.5,
  /** The calf starts to surface this long before `seconds`, rising over `surface` seconds. */
  calfLead: 20,
  surface: 2.5,
  /** After Mom stops rowing the canoe eases down to `drift` (m/s) over `driftEase` seconds: a glide, never a halt (she rows on through the end shot). */
  drift: 1.4,
  driftEase: 4,
  /** Glide allowed past `seconds` while the closing pages are read (world is built this long). */
  tail: 40,
  fadeMs: 700,
} as const;

/** When Mom stops rowing: the calf has just finished surfacing. */
export const STOP_AT = RIDE.seconds - RIDE.calfLead + RIDE.surface;
/** The closing pages open this long after she stops. */
export const STOP_PAUSE = 1.2;

export const OPENING_PAGES: readonly string[] = ['Mom pushes off from the shore.'];
export const CLOSING_PAGES: readonly string[] = [
  'Mom stops rowing. She has seen it too.',
  'Mom: "Look. She wasn\'t alone."',
  'She smiles for the first time since the river.',
];

/** Short talks with Mom on the way (player-paced pages; the canoe keeps moving behind them). */
export const BEATS: readonly { at: number; pages: readonly string[] }[] = [
  {
    at: 9,
    pages: ['Mom: "Are you hurt? Anywhere?"', 'You shake your head.', 'Mom: "Good. Good."'],
  },
  {
    at: 24,
    pages: [
      'Mom: "The lab is gone. Nobody can make more of it now."',
      'Mom: "There is a field hospital past the hills. They need what I know about the virus. I owe them that."',
    ],
  },
  {
    at: 39,
    pages: [
      'Mom: "She knew, you know. Every one she took, she kept from us."',
      'Mom: "I named her the day she first came to the glass. She heard me singing."',
    ],
  },
];

export const smooth = (k: number): number => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/** Pure: the canoe's speed (m/s) at `t`: eases up at the push-off, and eases down to a drift once Mom stops at `stopAt`. */
export function speedAt(t: number, stopAt: number | null): number {
  const { speed, easeIn, drift, driftEase } = RIDE;
  const up = speed * Math.min(1, Math.max(0, t) / easeIn);
  return stopAt === null ? up : up - (up - drift) * smooth((t - stopAt) / driftEase);
}

/** Pure: metres travelled by time `t` (the integral of `speedAt`, in closed form). */
export function travelled(t: number, stopAt: number | null = null): number {
  const { speed, easeIn, drift, driftEase: e } = RIDE;
  const ramp = (s: number): number =>
    s < easeIn ? (speed * s * s) / (2 * easeIn) : speed * (s - easeIn / 2);
  const s = Math.max(0, t);
  if (stopAt === null || s <= stopAt) return ramp(s);
  const u = s - stopAt;
  const k = Math.min(1, u / e);
  // The integral of smoothstep: e (k^3 - k^4 / 2), then e / 2 plus the time past the ease.
  const eased = u < e ? e * (k ** 3 - k ** 4 / 2) : e / 2 + (u - e);
  return ramp(stopAt) + speed * u - (speed - drift) * eased;
}

/** The director's memory: the next talk, whether Mom has stopped, whether the closing pages are out. */
export interface Script {
  beat: number;
  stopped: boolean;
  /** The player has seen the calf (canoe-look): the closing pages wait for it. */
  looked: boolean;
  closed: boolean;
}
export const newScript = (): Script => ({ beat: 0, stopped: false, looked: false, closed: false });

export type Cue = { kind: 'stop' } | { kind: 'beat' | 'closing'; pages: readonly string[] };

/**
 * Pure: the one thing due at ride time `t`, or null. `reading` is true while any page is open:
 * a talk or the closing pages wait for it, but Mom stops on time regardless.
 */
export function nextCue(s: Script, t: number, reading: boolean): Cue | null {
  if (!s.stopped && t >= STOP_AT) {
    s.stopped = true;
    return { kind: 'stop' };
  }
  if (reading) return null;
  const talk = BEATS[s.beat];
  if (talk && t >= talk.at) {
    s.beat++;
    return { kind: 'beat', pages: talk.pages };
  }
  if (s.stopped && s.looked && !talk && !s.closed && t >= STOP_AT + STOP_PAUSE) {
    s.closed = true;
    return { kind: 'closing', pages: CLOSING_PAGES };
  }
  return null;
}

/** Calf: side of the canoe (m), pace-keeping drift and how deep it starts. */
export const CALF = { side: 4.2, ahead: 1.6, hidden: -1.7, cruise: -0.15, blow: 0.35 } as const;
export interface CalfPose {
  /** Canoe-local offset and height above the world origin. */
  x: number;
  z: number;
  y: number;
  /** Pitch (nose up while rising). */
  pitch: number;
  visible: boolean;
  /** 0 hidden .. 1 fully surfaced. */
  surfaced: number;
}

/** Pure: the calf beside the canoe at `t`: rises, then keeps pace, weaving a little. */
export function calfPose(t: number, out: CalfPose): CalfPose {
  const k = smooth((t - (RIDE.seconds - RIDE.calfLead)) / RIDE.surface);
  out.surfaced = k;
  out.visible = k > 0;
  out.x = CALF.side + Math.sin(t * 0.5) * 0.5;
  out.z = CALF.ahead + Math.sin(t * 0.37) * 0.7;
  out.y = CALF.hidden + (CALF.cruise - CALF.hidden) * k + Math.sin(t * 1.7) * 0.04 * k;
  out.pitch = (1 - k) * 0.5;
  return out;
}
