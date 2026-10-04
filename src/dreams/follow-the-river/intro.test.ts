import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { resolveCircle, type Box } from '../../engine/collide';
import { PLAYER_RADIUS } from '../../engine/player';
import {
  gazeStep,
  INTRO_PAGES,
  momGaze,
  nextIntroStep,
  type GazeState,
  type IntroStep,
} from './intro';
import {
  AT,
  createCharacter,
  DOOR_CAP,
  MOM_PATH,
  OUTSIDE_COLLIDERS,
  REACH,
  ROOM_COLLIDERS,
} from './intro-scene';
import { makePhone } from './phone';

/** A free standing point (not pushed by any collider) within `reach` of `at`. */
function reachable(at: { x: number; z: number }, reach: number, boxes: readonly Box[]): boolean {
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = at.x + Math.cos(a) * reach * 0.9;
    const z = at.z + Math.sin(a) * reach * 0.9;
    const p = resolveCircle(x, z, PLAYER_RADIUS, boxes);
    if (Math.hypot(p.x - x, p.z - z) < 1e-6) return true;
  }
  return false;
}

const MOM_RADIUS = 0.3;

/** Every 0.1 m along the path, Mom's footprint is not pushed by any box. */
function pathIsClear(path: readonly { x: number; z: number }[], boxes: readonly Box[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) return false;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      const p = resolveCircle(x, z, MOM_RADIUS, boxes);
      if (Math.hypot(p.x - x, p.z - z) > 1e-6) return false;
    }
  }
  return true;
}

describe('intro', () => {
  it('runs news → Mom leaves → Mom back → outside → throw → goodbye → done', () => {
    const steps: IntroStep[] = ['news'];
    while (steps[steps.length - 1] !== 'done') steps.push(nextIntroStep(steps[steps.length - 1]));
    expect(steps).toEqual([
      'news',
      'mom-leaves',
      'mom-back',
      'outside',
      'throw',
      'goodbye',
      'done',
    ]);
  });

  it('has pages for every step, and Mom says the line', () => {
    for (const pages of Object.values(INTRO_PAGES)) expect(pages.length).toBeGreaterThan(0);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/Always follow the river/);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/What have we done/);
  });

  it('every prompt spot can be reached from a free point, in world coordinates', () => {
    expect(reachable(AT.tv, REACH.tv, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.momInside, REACH.mom, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.momDoor, REACH.mom, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.door, REACH.door, ROOM_COLLIDERS)).toBe(true);
    expect(reachable(AT.momRiver, REACH.mom, OUTSIDE_COLLIDERS)).toBe(true);
  });

  it('spawns are free, the room spawn is out of reach of the TV, and the spots are in the room', () => {
    for (const [at, boxes] of [
      [AT.spawnRoom, ROOM_COLLIDERS],
      [AT.spawnRiver, OUTSIDE_COLLIDERS],
    ] as const) {
      const p = resolveCircle(at.x, at.z, PLAYER_RADIUS, boxes);
      expect(Math.hypot(p.x - at.x, p.z - at.z)).toBeLessThan(1e-6);
    }
    expect(Math.hypot(AT.spawnRoom.x - AT.tv.x, AT.spawnRoom.z - AT.tv.z)).toBeGreaterThan(
      REACH.tv,
    );
    for (const at of [AT.tv, AT.momInside, AT.momDoor, AT.door]) {
      expect(Math.abs(at.x - AT.spawnRoom.x)).toBeLessThan(4);
    }
  });

  it("Mom's routes never cross the walls, the couch or the TV", () => {
    const room = ROOM_COLLIDERS.filter((b) => b !== DOOR_CAP); // she walks out through the cap
    const pace = [...MOM_PATH.pace, MOM_PATH.pace[0]];
    expect(pathIsClear(pace, room)).toBe(true);
    for (const from of MOM_PATH.pace) expect(pathIsClear([from, ...MOM_PATH.out], room)).toBe(true);
    const outside = MOM_PATH.out[MOM_PATH.out.length - 1];
    expect(pathIsClear([outside, ...MOM_PATH.in], room)).toBe(true);
    const river = [AT.momRiverStart, AT.momRiverNear, AT.momRiver, AT.momRiverBack];
    expect(pathIsClear(river, OUTSIDE_COLLIDERS)).toBe(true);
    expect(pathIsClear([AT.momRiver, { x: AT.momRiver.x + 1, z: 0 }], OUTSIDE_COLLIDERS)).toBe(
      false, // the water's edge really is the edge
    );
  });
});

/** A one-bone rig scaled x100 like the Quaternius characters. */
function rig(): ReturnType<typeof createCharacter> {
  const scene = new THREE.Group();
  const wrist = new THREE.Bone();
  wrist.name = 'WristR';
  wrist.scale.setScalar(100);
  scene.add(wrist);
  return createCharacter({
    scene,
    clips: [new THREE.AnimationClip('CharacterArmature|Idle', 1, [])],
  });
}

describe('character.attach grip option', () => {
  it('keeps the old behaviour by default: cancels the x100 and grips at the pack offset', () => {
    const item = new THREE.Group();
    rig().attach(item, 'WristR');
    expect(item.scale.x).toBeCloseTo(0.01);
    expect(item.position.y).toBeCloseTo(0.0012);
  });

  it('takes an explicit grip, and grip null leaves the prop where it was put', () => {
    const c = rig();
    const gripped = new THREE.Group();
    c.attach(gripped, 'WristR', { grip: 0.05 });
    expect(gripped.position.y).toBeCloseTo(0.0005);
    const arm = new THREE.Group();
    arm.position.set(0, 0.3, 0.2);
    arm.scale.setScalar(2);
    c.attach(arm, 'WristR', { grip: null, fitScale: false });
    expect(arm.position.toArray()).toEqual([0, 0.3, 0.2]);
    expect(arm.scale.x).toBe(2);
  });
});

describe('the phone', () => {
  it('is a small dark slab with a dim blue screen, hidden until Mom films', () => {
    const phone = makePhone();
    expect(phone.visible).toBe(false);
    const [body, screen] = phone.children;
    if (!body || !(screen instanceof THREE.Mesh)) throw new Error('phone parts');
    const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
    expect(size.toArray().map((v) => +v.toFixed(3))).toEqual([0.075, 0.15, 0.009]);
    const mat: unknown = screen.material;
    expect(mat instanceof THREE.MeshBasicMaterial && mat.color.getHex()).toBe(0x6f86b0);
  });

  it('shows during the last goodbye page, after the three Mom pages', () => {
    const pages = INTRO_PAGES.goodbye;
    expect(pages).toHaveLength(4);
    expect(pages.slice(0, 3).every((p) => p.startsWith('Mom:'))).toBe(true);
    expect(pages[3]).toMatch(/phone/);
  });
});

describe("Mom's gaze", () => {
  it('is on you while her page is open, on the TV during the news, free otherwise', () => {
    expect(momGaze('mom-leaves', true)).toBe('you');
    expect(momGaze('news', true)).toBe('you');
    expect(momGaze('news', false)).toBe('tv');
    expect(momGaze('throw', false)).toBeNull();
  });
});

describe('gazeStep', () => {
  it('eases in and out, and goes down to nothing before it changes target', () => {
    const g: GazeState = { kind: null, weight: 0 };
    gazeStep(g, 'you', 1 / 60, 0.8);
    expect(g.kind).toBe('you');
    expect(g.weight).toBeGreaterThan(0);
    expect(g.weight).toBeLessThan(0.2); // no pop on the first frame
    for (let i = 0; i < 120; i++) gazeStep(g, 'you', 1 / 60, 0.8);
    expect(g.weight).toBeCloseTo(0.8, 2);
    gazeStep(g, 'tv', 1 / 60, 0.8);
    expect(g.kind).toBe('you'); // still looking at you, easing out
    expect(g.weight).toBeLessThan(0.8);
    for (let i = 0; i < 200; i++) gazeStep(g, 'tv', 1 / 60, 0.8);
    expect(g.kind).toBe('tv');
    expect(g.weight).toBeCloseTo(0.8, 2);
    for (let i = 0; i < 200; i++) gazeStep(g, null, 1 / 60, 0.8);
    expect(g.weight).toBeLessThan(0.01);
  });
});
