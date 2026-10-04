import { describe, expect, it } from 'vitest';
import { createMomActor, tenseBeat, WALK_SPEED, type MomBody } from './mom-actor';

function stub(): MomBody & { played: string[] } {
  const played: string[] = [];
  return {
    group: { position: { x: 0, z: 0 }, rotation: { y: 0 }, visible: true },
    rest: 'Idle',
    played,
    play: (name) => void played.push(name),
  };
}

function run(actor: { update(dt: number): void }, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) actor.update(dt);
}

describe('tenseBeat', () => {
  it('is deterministic, waits a few seconds, and gestures every fourth beat', () => {
    for (let i = 0; i < 40; i++) {
      const b = tenseBeat(i);
      expect(b).toEqual(tenseBeat(i));
      expect(b.wait).toBeGreaterThanOrEqual(2);
      expect(b.wait).toBeLessThanOrEqual(5);
      expect(b.kind === 'gesture').toBe(i % 4 === 3);
    }
    expect(new Set([0, 1, 2, 3].map((i) => tenseBeat(i).kind))).toEqual(
      new Set(['glance', 'shift', 'gesture']),
    );
  });
});

describe('MomActor', () => {
  it('walks the waypoints at the given speed, faces travel, then rests', async () => {
    const mom = stub();
    const actor = createMomActor(mom);
    let done = false;
    const walk = actor
      .walkTo([
        { x: 0, z: 2 },
        { x: 2, z: 2 },
      ])
      .then(() => (done = true));
    expect(mom.played).toEqual(['Walk']);
    run(actor, 1);
    expect(mom.group.position.z).toBeCloseTo(WALK_SPEED, 1);
    expect(mom.group.rotation.y).toBeCloseTo(0, 1); // +z travel
    run(actor, 1);
    expect(mom.group.position.z).toBe(2);
    run(actor, 1);
    expect(mom.group.rotation.y).toBeCloseTo(Math.PI / 2, 1); // turned toward +x
    expect(done).toBe(false);
    run(actor, 2);
    await walk;
    expect(mom.group.position).toEqual({ x: 2, z: 2 });
    expect(mom.played).toEqual(['Walk', 'Idle']);
  });

  it('stop() resolves a pending walk and leaves her resting where she is', async () => {
    const mom = stub();
    const actor = createMomActor(mom);
    const walk = actor.walkTo([{ x: 10, z: 0 }]);
    run(actor, 0.5);
    actor.stop();
    await walk;
    expect(mom.group.position.x).toBeGreaterThan(0);
    expect(mom.group.position.x).toBeLessThan(1);
    expect(mom.played.at(-1)).toBe('Idle');
    run(actor, 1);
    expect(mom.played).toHaveLength(2);
  });

  it('paces between points with dwells, and idles tensely with gestures and glances', () => {
    const mom = stub();
    const actor = createMomActor(mom);
    actor.idleTense([{ x: 0, z: -5 }]);
    expect(mom.rest).toBe('Idle_Neutral');
    actor.pace(
      [
        { x: -1, z: 0 },
        { x: 1, z: 0 },
      ],
      3,
    );
    run(actor, 60);
    expect(mom.played).toContain('Walk');
    expect(mom.played).toContain('Interact');
    expect(Math.abs(mom.group.position.x)).toBeLessThanOrEqual(1 + 1e-9);
    actor.stop();
    run(actor, 30);
    const n = mom.played.length;
    run(actor, 10);
    expect(mom.played).toHaveLength(n); // nothing scheduled after stop
  });

  it('weight shifts alternate direction', () => {
    const mom = stub();
    const actor = createMomActor(mom);
    actor.idleTense([]);
    const yaws: number[] = [];
    let last = 0;
    for (let i = 0; i < 40 * 60 * 4; i++) {
      actor.update(1 / 60);
      if (mom.group.rotation.y !== last) yaws.push(Math.sign(mom.group.rotation.y - last));
      last = mom.group.rotation.y;
    }
    expect(yaws).toContain(1);
    expect(yaws).toContain(-1);
  });

  it('faceTo eases the body toward the point', () => {
    const mom = stub();
    const actor = createMomActor(mom);
    actor.faceTo(5, 0);
    run(actor, 0.1);
    expect(mom.group.rotation.y).toBeGreaterThan(0.3);
    expect(mom.group.rotation.y).toBeLessThan(Math.PI / 2);
    run(actor, 2);
    expect(mom.group.rotation.y).toBeCloseTo(Math.PI / 2, 2);
  });
});
