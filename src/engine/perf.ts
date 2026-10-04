import type * as THREE from 'three/webgpu';

/** DEV-only frame probe: `kd.perf.sample(seconds)`. Costs nothing unless a sample is running. */

export interface Stat {
  median: number;
  p95: number;
  max: number;
}

export interface PerfReport {
  seconds: number;
  frames: number;
  fps: number;
  /** Time between animation ticks (ms). */
  intervalMs: Stat;
  /** JS time of one tick: updaters, post graph build, render submit (ms). */
  cpuMs: Stat;
  /** GPU time per frame (ms); null unless the page was opened with `?perf` on WebGPU. */
  gpuMs: Stat | null;
  /** Median GPU ms per render pass, in submission order (shadows, reflection, pre-pass, scene...). */
  gpuPassMs: number[] | null;
  /** Median per frame (all passes: shadows, reflection, pre-pass, scene...). */
  drawCalls: number;
  triangles: number;
}

export interface Perf {
  /** True when GPU timestamp queries are on (`?perf`, WebGPU, and the adapter supports them). */
  readonly gpu: boolean;
  /** Stage calls this at the start and end of every tick. */
  begin(now: number): void;
  end(): void;
  sample(seconds: number): Promise<PerfReport>;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function summarize(values: readonly number[]): Stat {
  return {
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: percentile(values, 1),
  };
}

/** Splits resolved timestamps (`r:<pass>:<ctx>:f<frame>` -> ms) into per-frame totals and per-pass series. */
export function groupPasses(
  stamps: ReadonlyMap<string, number>,
  prefix: 'r' | 'c',
): { totals: number[]; passes: number[][] } {
  const frames = new Map<number, number>();
  const passes: number[][] = [];
  for (const [uid, ms] of stamps) {
    const [kind, pass, , frame] = uid.split(':');
    if (kind !== prefix) continue;
    const f = Number(frame.slice(1));
    frames.set(f, (frames.get(f) ?? 0) + ms);
    (passes[Number(pass)] ??= []).push(ms);
  }
  return { totals: [...frames.values()], passes };
}

interface Pool {
  timestamps: Map<string, number>;
}

function renderPool(renderer: THREE.WebGPURenderer): Pool | undefined {
  const pools: unknown = Reflect.get(renderer.backend, 'timestampQueryPool');
  const render: unknown = typeof pools === 'object' && pools ? Reflect.get(pools, 'render') : null;
  if (!render || typeof render !== 'object' || !('timestamps' in render)) return undefined;
  const stamps: unknown = render.timestamps;
  // three's pool map is Map<string, number>; instanceof leaves it Map<any, any>.
  // oxlint-disable-next-line typescript/no-unsafe-assignment
  return stamps instanceof Map ? { timestamps: stamps } : undefined;
}

export function createPerf(renderer: THREE.WebGPURenderer): Perf {
  const gpu = Reflect.get(renderer.backend, 'trackTimestamp') === true;
  let sampling = false;
  let intervals: number[] = [];
  let cpu: number[] = [];
  let gpuTotals: number[] = [];
  let gpuPasses: number[][] = [];
  let draws: number[] = [];
  let tris: number[] = [];
  let last = 0;
  let lastFrame = 0;
  let t0 = 0;
  let resolving = false;

  /** Reads what the GPU finished since the last read (one resolve at a time; a frame or two late). */
  const resolve = async (): Promise<void> => {
    if (resolving) return;
    resolving = true;
    try {
      await renderer.resolveTimestampsAsync('render');
      const pool = renderPool(renderer);
      if (!pool || !sampling) return;
      const g = groupPasses(pool.timestamps, 'r');
      pool.timestamps.clear(); // the backend refills it on the next resolve; never count a frame twice
      gpuTotals.push(...g.totals);
      g.passes.forEach((ms, i) => (gpuPasses[i] ??= []).push(...ms));
    } finally {
      resolving = false;
    }
  };

  return {
    gpu,
    begin(now) {
      if (!sampling) return;
      // three resets the counters and advances `info.frame` once per animation tick; a loop stepped by
      // hand (the playtest harness) does neither, which merged many frames into one. Do both here.
      const info = renderer.info;
      info.reset();
      if (info.frame <= lastFrame) Object.assign(info, { frame: lastFrame + 1 }); // frame is typed readonly
      lastFrame = info.frame;
      if (last > 0) intervals.push(now - last);
      last = now;
      t0 = performance.now();
    },
    end() {
      if (!sampling) return;
      cpu.push(performance.now() - t0);
      draws.push(renderer.info.render.drawCalls);
      tris.push(renderer.info.render.triangles);
      if (gpu) resolve().catch(() => undefined); // a failed read only loses that sample
    },
    async sample(seconds) {
      intervals = [];
      cpu = [];
      gpuTotals = [];
      gpuPasses = [];
      draws = [];
      tris = [];
      last = 0;
      sampling = true;
      await new Promise((r) => setTimeout(r, seconds * 1000));
      if (gpu) await resolve();
      sampling = false;
      const frames = cpu.length;
      return {
        seconds,
        frames,
        fps: frames / seconds,
        intervalMs: summarize(intervals),
        cpuMs: summarize(cpu),
        gpuMs: gpu ? summarize(gpuTotals) : null,
        gpuPassMs: gpu ? gpuPasses.map((ms) => percentile(ms, 0.5)) : null,
        drawCalls: percentile(draws, 0.5),
        triangles: percentile(tris, 0.5),
      };
    },
  };
}
