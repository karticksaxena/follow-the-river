/**
 * Mom as an actor: walks waypoints with the Walk clip, turns smoothly, idles tensely.
 * Everything runs in game time through `update(dt)`; nothing is allocated per frame.
 */

export interface Pt {
  readonly x: number;
  readonly z: number;
}

/** The slice of `Mom` the actor drives (structural, so tests can pass a stub). */
export interface MomBody {
  group: {
    position: { x: number; z: number };
    rotation: { y: number };
    visible: boolean;
  };
  /** Clip to return to after a one-shot gesture. */
  rest: string;
  play(name: string, once?: boolean): void;
}

export const WALK_SPEED = 1.3; // m/s, matched by eye to the Walk clip's stride
export const TURN_RATE = 6; // 1/s: yaw ease-out speed
const TENSE_WAIT = { min: 2, max: 5 }; // seconds between tense beats
const SHIFT = 0.35; // rad: how far a weight shift turns the body
const ARRIVE = 0.02; // m: closer than this counts as on the waypoint

export type TenseKind = 'glance' | 'shift' | 'gesture';

export interface TenseBeat {
  wait: number;
  kind: TenseKind;
}

/** Pure: the i-th tense beat — deterministic waits, a hand gesture every fourth beat. */
export function tenseBeat(i: number): TenseBeat {
  const r = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const wait = TENSE_WAIT.min + (r - Math.floor(r)) * (TENSE_WAIT.max - TENSE_WAIT.min);
  const kind: TenseKind = i % 4 === 3 ? 'gesture' : i % 2 ? 'shift' : 'glance';
  return { wait, kind };
}

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export interface MomActor {
  /** Walks the points in order (Walk clip, facing travel); resolves on arrival or `stop()`. */
  walkTo(points: readonly Pt[], speed?: number): Promise<void>;
  /** Loops: walk to the next point, dwell there tensely, repeat — until `stop()`. */
  pace(points: readonly Pt[], dwell: number): void;
  faceTo(x: number, z: number): void;
  /** Idle_Neutral with periodic shifts, glances at `glances` in turn and the odd gesture. */
  idleTense(glances: readonly Pt[]): void;
  /** Cancels walking, pacing and tense idling (resolving any pending walk) and rests. */
  stop(): void;
  update(dt: number): void;
}

interface Walk {
  points: readonly Pt[];
  i: number;
  speed: number;
  done: () => void;
}

interface Pace {
  points: readonly Pt[];
  dwell: number;
  i: number;
  left: number;
  /** One-slot scratch so each leg's walk needs no new array. */
  leg: Pt[];
}

interface Tense {
  glances: readonly Pt[];
  beat: number;
  left: number;
  glance: number;
}

interface ActorState {
  walk: Walk | null;
  pace: Pace | null;
  tense: Tense | null;
  yaw: number;
}

const NOOP = (): void => undefined;

function stepWalk(mom: MomBody, st: ActorState, w: Walk, dt: number): void {
  const pos = mom.group.position;
  const to = w.points[w.i];
  if (!to) return finishWalk(mom, st, w);
  const dx = to.x - pos.x;
  const dz = to.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const step = w.speed * dt;
  if (dist > ARRIVE) st.yaw = Math.atan2(dx, dz);
  if (dist <= step) {
    pos.x = to.x;
    pos.z = to.z;
    w.i++;
    if (w.i >= w.points.length) finishWalk(mom, st, w);
    return;
  }
  pos.x += (dx / dist) * step;
  pos.z += (dz / dist) * step;
}

function finishWalk(mom: MomBody, st: ActorState, w: Walk): void {
  st.walk = null;
  mom.play(mom.rest);
  w.done();
}

function tenseTick(mom: MomBody, st: ActorState, t: Tense, dt: number): void {
  t.left -= dt;
  if (t.left > 0) return;
  const beat = tenseBeat(t.beat++);
  t.left = beat.wait;
  const pos = mom.group.position;
  if (beat.kind === 'gesture') mom.play('Interact', true);
  else if (beat.kind === 'shift')
    st.yaw += (t.beat >> 2) & 1 ? SHIFT : -SHIFT; // alternates
  else {
    const g = t.glances[t.glance++ % t.glances.length];
    if (g) st.yaw = Math.atan2(g.x - pos.x, g.z - pos.z);
  }
}

export function createMomActor(mom: MomBody): MomActor {
  const st: ActorState = { walk: null, pace: null, tense: null, yaw: mom.group.rotation.y };
  const startWalk = (points: readonly Pt[], speed: number, done: () => void): void => {
    st.walk?.done();
    st.walk = { points, i: 0, speed, done };
    mom.play('Walk');
  };
  const paceTick = (p: Pace, dt: number): void => {
    if (st.walk) return;
    p.left -= dt;
    if (p.left > 0) return;
    p.left = p.dwell;
    p.i = (p.i + 1) % p.points.length;
    p.leg[0] = p.points[p.i] ?? p.leg[0];
    startWalk(p.leg, WALK_SPEED, NOOP);
  };
  return {
    walkTo: (points, speed = WALK_SPEED) =>
      new Promise((resolve) => {
        st.pace = null;
        startWalk(points, speed, resolve);
      }),
    pace(points, dwell) {
      const first = points[0];
      if (!first) return;
      st.pace = { points, dwell, i: 0, left: dwell, leg: [first] }; // dwell first: she starts on points[0]
    },
    faceTo(x, z) {
      const pos = mom.group.position;
      st.yaw = Math.atan2(x - pos.x, z - pos.z);
    },
    idleTense(glances) {
      mom.rest = 'Idle_Neutral';
      st.tense = { glances, beat: 0, left: tenseBeat(0).wait, glance: 0 };
      if (!st.walk) mom.play('Idle_Neutral');
    },
    stop() {
      st.pace = null;
      st.tense = null;
      const w = st.walk;
      if (w) finishWalk(mom, st, w);
    },
    update(dt) {
      if (st.walk) stepWalk(mom, st, st.walk, dt);
      else if (st.tense) tenseTick(mom, st, st.tense, dt);
      if (st.pace) paceTick(st.pace, dt);
      const body = mom.group.rotation;
      body.y += wrapAngle(st.yaw - body.y) * (1 - Math.exp(-TURN_RATE * dt));
    },
  };
}
