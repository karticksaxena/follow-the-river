# Follow the River v1 (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plan 1 test riverbank with the real first chapter of Follow the River: intro (TV news, Mom, fish thrown in), Day 1 in the city (scavenging, slow zombies in dark shacks, jumpscares, Tape 1), "Wait for dark", Night 1 (run downstream past fast zombies to a safe spot, flashlight stun, silent bow, the giant fish), death → checkpoint restart, saves, hints and "To be continued".

**Architecture:** A chapter is data (`AreaDef`: props, shacks, pickups, lurkers, scares, tape, night route, safe spot) built by one generic `buildWorld`. Gameplay systems (horde, flashlight, bow, fish, pickups, HUD) are small modules driven by one phase controller in the dream's `index.ts`. Pure logic (phase machine, supplies, zombie brain, spawner, beam test, arrow flight, fish strikes) lives in tested functions; rendering and audio are thin wrappers checked in Chrome. Plan 3 then adds two `AreaDef`s, the gun and the ending without new systems.

**Tech Stack:** Vite, strict TypeScript, three.js `WebGPURenderer` (WebGL 2 fallback), TSL, `SkeletonUtils.clone` + `AnimationMixer` for skinned characters, Web Audio through three's `AudioListener`, Vitest, Blender (headless scripts + project MCP), Kenney/Quaternius CC0 assets, macOS `afconvert` for audio.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md` · Carry-overs: `docs/superpowers/plans/2026-10-03-plan-1-followups.md`

## Global Constraints

- Project rules in `CLAUDE.md` apply to every task: functions < 50 lines, files < 500 lines, no per-frame allocations in hot loops, no `console` in committed code, text via `textContent`/`el()` only, three core from `three/webgpu`, addons from `three/addons/...js`.
- `pnpm run check` (lint + typecheck + format:check + test + build) must pass before every commit.
- **Never bright.** Day is overcast grey; night is dark blue-black. Light and fog values are named constants.
- **No world edge.** Sky dome follows the player; ground/water run past the play strip; fog ends every view; play space is closed by believable blockers.
- **Player-paced text.** Hints, tapes, story lines and choices wait for the player (`ctx.read`, `ctx.choose`). Nothing advances or disappears on a timer.
- **Pause means pause.** While `ctx.isPaused()` is true no gameplay state changes (zombies, arrows, fish, scares, battery, health) and the world audio channel is muted; the voice channel (tapes) keeps playing.
- **Assets:** CC0 only, every file listed in `public/assets/LICENSES.md`. URLs built with `assetUrl()` (Task 1). Each Kenney kit lives in its own folder with its own `Textures/colormap.png` (the kits share that file name with different images).
- **Smooth animation:** skinned clips change with `crossFadeTo`/`fadeIn`/`fadeOut` (0.2–0.35 s), never a hard `stop()` + `play()`.
- **Saves** only through `createSaveStore`; written at phase boundaries only.
- Never push. The repo has no remote until Kartik creates one.
- Subagents run on Sonnet only.

## Review Focus

1. **Pausing mid-action** (Esc, a hint page, a tape) during a zombie lunge, an arrow in flight, a fish strike or a scare jolt: nothing advances and nobody takes damage until the game resumes; groans and stings go silent, a tape voice keeps playing. Pinned by `play.ts` returning early while paused (Task 16, step 1 of its update), the brain/arrow/fish logic only advancing through `update(dt)` (Tasks 10, 13, 14), and the browser checks in Tasks 16 and 19.
2. **Dying and restarting**: dying mid-night restarts that night with the supplies held when it began, picked-up items are back, dead zombies are gone, the fish strikes reset. Pinned by `restartPhase` tests in Task 7 and the death/restart browser check in Task 16.
3. **Running out**: 0 battery, 0 arrows, 0 fish packs. The flashlight goes dark, the bow clicks empty, throwing is refused with a prompt; counts never go negative. Pinned in Tasks 7 (`spend`/`addSupply`), 13 (battery), 14 (`canThrow`) and 15 (`promptFor`).
4. **Old or corrupt save**: a save from Plan 1 (none exists) or a hand-edited one with the wrong shape starts a fresh run instead of crashing. Pinned by `isRunSave` tests in Task 7.
5. **Quit to home mid-night and come back**: no groans keep playing, no updaters or DOM (HUD) are left behind, the scene is disposed, and the dream offers "Continue" from the saved phase. Pinned by the dispose test in Task 1, `Chapter.dispose` in Task 16 and the release check in Task 19.

---

## File map

```
src/engine/
  assets.ts            (new)  assetUrl()
  dispose.ts           (new)  disposeScene()
  grid.ts              (new)  BoxGrid spatial hash for colliders
  audio.ts             (mod)  channels, load cache, positional, world pause, Safari resume
  input.ts             (mod)  mouse buttons as Mouse0/Mouse2 codes
  menus.ts             (mod)  showChoice()
  models.ts            (mod)  marks cached geometry/materials; loadSkinned()
  player.ts            (mod)  setColliders() via BoxGrid; stun-free knockback hook
  sky.ts               (mod)  paintSkyDome()
src/session.ts         (new)  player + pause menu + reader wiring (split out of app.ts)
src/app.ts             (mod)  load → start → fail flow only
src/dreams/types.ts    (mod)  read(pages, onDone), choose(), finish()
src/dreams/follow-the-river/
  state.ts             (new)  phases, supplies, checkpoints, save shape (pure)
  kits.ts              (new)  Kenney kit folders + scales, character URLs
  lighting.ts          (new)  dusk/day/night presets, sun/moon disc
  river.ts             (new)  river constants + river meshes (from riverbank.ts)
  world.ts             (new)  buildWorld(area)
  shack.ts             (new)  enterable dark shacks from the survival kit
  areas/types.ts       (new)  AreaDef
  areas/city.ts        (new)  Day 1 / Night 1 layout
  hud.ts               (new)  battery, arrows, fish, health, prompt, crosshair, hurt flash
  pickups.ts           (new)  pickup meshes, nearestPickup(), collect()
  zombies/brain.ts     (new)  pure zombie state machine
  zombies/spawner.ts   (new)  pure night spawn rules
  zombies/horde.ts     (new)  pool, animation, movement, groans, hits
  zombies/look.ts      (new)  outfits, clip names, clip speeds
  zombies/steer.ts     (new)  chase direction + separation
  flashlight.ts        (mod)  battery drain, beam test, intensity-only toggle
  bow.ts               (new)  viewmodel, arrows in flight, recovery
  fish.ts              (new)  the orca: follows, feeds, strikes
  sounds.ts            (new)  sound URLs, horde layer, tape voice, splash, twang
  scares.ts            (new)  scripted day scares (watcher reused)
  tapes.ts             (new)  Mom's tape transcripts
  hints.ts             (new)  first-time hint texts
  flow.ts              (new)  pure chapter helpers (damage, spawn spots, titles)
  chapter.ts           (new)  day → wait for dark → night → safe spot controller
  play.ts              (new)  per-frame gameplay update
  intro.ts             (new)  house, TV, Mom, the orca
  news.ts              (new)  TV news canvas
  index.ts             (rewrite) phase controller
  riverbank.ts, riverbank.test.ts (delete — replaced by river.ts/world.ts)
tools/blender/dream1_props.py (new) bow, arrow, battery, tape, TV, boathouse
tools/blender/zombify.py      (new) zombies: Quaternius modular people + retargeted zombie clips + painted rot (Task 5)
tools/blender/orca.py         (new) the orca guardian, rigged Swim/Lunge (Task 5)
public/assets/kits/{city,roads,cars,survival,suburb}/  (new) Kenney GLBs + Textures/colormap.png
public/assets/characters/{mom,zombie-m,zombie-f,orca}.glb (new)
public/assets/props/*.glb                               (new)
public/assets/sounds/**/*.m4a                           (new)
```

---

### Task 1: Engine groundwork — asset URLs, scene disposal, Vitest excludes

**Files:**
- Create: `src/engine/assets.ts`, `src/engine/assets.test.ts`, `src/engine/dispose.ts`, `src/engine/dispose.test.ts`
- Modify: `src/engine/models.ts`, `src/home/bedroom.ts:94`, `src/dreams/follow-the-river/watcher.ts:22`, `src/dreams/follow-the-river/skyline.ts:59`, `src/app.ts` (cleanUp), `src/home/home.ts` (dispose), `vite.config.ts`

**Interfaces:**
- Produces: `assetUrl(path: string): string`; `disposeScene(root: THREE.Object3D): void`; `markCached(root: THREE.Object3D): void` (in `models.ts`, called by `loadModel`).

- [ ] **Step 1: Write the failing tests**

`src/engine/assets.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { assetUrl } from './assets';

describe('assetUrl', () => {
  it('builds URLs under the site base path', () => {
    expect(assetUrl('river/pine.glb')).toBe(`${import.meta.env.BASE_URL}assets/river/pine.glb`);
  });
});
```

`src/engine/dispose.test.ts`:
```ts
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { disposeScene } from './dispose';
import { markCached } from './models';

function mesh(): THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial> {
  const material = new THREE.MeshLambertMaterial({ map: new THREE.Texture() });
  return new THREE.Mesh(new THREE.BoxGeometry(), material);
}

describe('disposeScene', () => {
  it('frees geometry, materials and textures the scene owns', () => {
    const scene = new THREE.Scene();
    const owned = mesh();
    scene.add(owned);
    const map = owned.material.map;
    if (!map) throw new Error('expected a texture');
    const spies = [owned.geometry, owned.material, map].map((x) => vi.spyOn(x, 'dispose'));
    disposeScene(scene);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('leaves cached model data alone (shared by every clone)', () => {
    const scene = new THREE.Scene();
    const cached = mesh();
    markCached(cached);
    scene.add(cached.clone());
    const map = cached.material.map;
    if (!map) throw new Error('expected a texture');
    const spies = [cached.geometry, cached.material, map].map((x) => vi.spyOn(x, 'dispose'));
    disposeScene(scene);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('frees light shadow maps', () => {
    const scene = new THREE.Scene();
    const lamp = new THREE.SpotLight();
    lamp.castShadow = true;
    scene.add(lamp);
    const spy = vi.spyOn(lamp.shadow, 'dispose');
    disposeScene(scene);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('frees a material shared by two meshes only once', () => {
    const scene = new THREE.Scene();
    const a = mesh();
    const b = new THREE.Mesh(new THREE.BoxGeometry(), a.material);
    scene.add(a, b);
    const spy = vi.spyOn(a.material, 'dispose');
    disposeScene(scene);
    expect(spy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/engine/assets.test.ts src/engine/dispose.test.ts`
Expected: FAIL — modules `./assets` and `./dispose` not found, `markCached` not exported.

- [ ] **Step 3: Implement**

`src/engine/assets.ts`:
```ts
/** URL of a file in `public/assets/`, correct even if the site is served from a sub-path. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}
```

`src/engine/dispose.ts`:
```ts
import * as THREE from 'three/webgpu';

function isCached(thing: { userData: Record<string, unknown> }): boolean {
  return thing.userData.cached === true;
}

function texturesOf(material: THREE.Material): THREE.Texture[] {
  return Object.values(material).filter((v): v is THREE.Texture => v instanceof THREE.Texture);
}

/**
 * Frees the GPU memory a scene owns: geometry, materials, their textures and shadow maps.
 * Data loaded through `loadModel` is marked cached and shared by every clone, so it stays.
 */
export function disposeScene(root: THREE.Object3D): void {
  const done = new Set<object>();
  const free = (thing: { dispose(): void; userData: Record<string, unknown> }): void => {
    if (done.has(thing) || isCached(thing)) return;
    done.add(thing);
    thing.dispose();
  };
  root.traverse((node) => {
    if (node instanceof THREE.Light && node.shadow) node.shadow.dispose();
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Sprite)) return;
    free(node.geometry);
    const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!isCached(material)) for (const texture of texturesOf(material)) free(texture);
      free(material);
    }
  });
}
```

In `src/engine/models.ts` add and call from `loadModel` (after `enableShadows(gltf.scene)`):
```ts
/** Flags geometry, materials and textures as shared cache data that `disposeScene` must keep. */
export function markCached(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.userData.cached = true;
    const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.userData.cached = true;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.userData.cached = true;
      }
    }
  });
}
```

Replace the three `/assets/...` literals with `assetUrl('home/${file}.glb')`, `assetUrl('river/watcher.glb')`, `assetUrl(\`river/${name}.glb\`)`.

`src/app.ts` `cleanUp`: after `dream.dispose()`, call `disposeScene(app.stage.scene)` **only if** `app.stage.scene !== homeScene` (a dream that failed before setting its scene must not free the bedroom). `src/home/home.ts` `dispose()`: call `disposeScene(room.scene)` last (the cloud textures and the lamp shadow are freed with it).

`vite.config.ts`:
```ts
import { configDefaults, defineConfig } from 'vitest/config';
// …
  test: {
    environment: 'node',
    // Worktrees and SDD scratch copies live inside the repo; never run their tests.
    exclude: [...configDefaults.exclude, '.claude/**', '.superpowers/**'],
  },
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run` — Expected: all pass, and the test count no longer includes `.claude/worktrees/**`.

- [ ] **Step 5: Commit**

`pnpm run check`, then `git add -A src vite.config.ts && git commit -m "feat(engine): asset URLs, scene disposal, vitest excludes"`

---

### Task 2: Spatial grid for colliders

**Files:**
- Create: `src/engine/grid.ts`, `src/engine/grid.test.ts`
- Modify: `src/engine/player.ts`, `src/dreams/follow-the-river/index.ts` (the one `player.colliders =` line)

**Interfaces:**
- Consumes: `Box`, `boxAt`, `resolveCircle` from `collide.ts`.
- Produces:
  ```ts
  export interface BoxGrid {
    /** Boxes whose cells touch the square around (x, z). Reused array: read it, don't keep it. */
    near(x: number, z: number, radius: number): readonly Box[];
  }
  export function createBoxGrid(boxes: readonly Box[], cell?: number): BoxGrid;
  // Player: `colliders: Box[]` is replaced by
  setColliders(boxes: readonly Box[]): void;
  /** Push the player (e.g. a zombie hit) by dx, dz metres, still respecting walls. */
  shove(dx: number, dz: number): void;
  ```

- [ ] **Step 1: Write the failing test** — `src/engine/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { boxAt } from './collide';
import { createBoxGrid } from './grid';

describe('createBoxGrid', () => {
  it('finds boxes near a point and skips far ones', () => {
    const near = boxAt(1, 1, 1, 1);
    const far = boxAt(100, 100, 1, 1);
    const grid = createBoxGrid([near, far]);
    expect(grid.near(0, 0, 1)).toEqual([near]);
  });

  it('returns a big box once even though it spans many cells', () => {
    const river = boxAt(10, -60, 14, 360);
    const grid = createBoxGrid([river]);
    expect(grid.near(4, -60, 30)).toEqual([river]);
  });

  it('works with negative coordinates and an empty grid', () => {
    expect(createBoxGrid([]).near(-50, -50, 5)).toEqual([]);
    const box = boxAt(-41, -77, 2, 2);
    expect(createBoxGrid([box]).near(-40, -76, 0.5)).toEqual([box]);
  });

  it('finds a box whose edge is just inside the query square', () => {
    const box = boxAt(9.5, 0, 1, 1); // spans x 9..10, cell 1 with the default size 8
    expect(createBoxGrid([box]).near(7.9, 0, 1.2)).toEqual([box]);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/engine/grid.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `src/engine/grid.ts`:
```ts
import type { Box } from './collide';

/** Bucket size in metres. Tuning knob: about the size of a shack. */
const CELL = 8;
/** Cell coordinates stay well inside ±2^15, so two of them pack into one number key. */
const OFFSET = 32768;

const key = (ix: number, iz: number): number => (ix + OFFSET) * 65536 + (iz + OFFSET);

export interface BoxGrid {
  /** Boxes whose cells touch the square around (x, z). Reused array: read it, don't keep it. */
  near(x: number, z: number, radius: number): readonly Box[];
}

/** Spatial hash so collision checks only look at nearby boxes, not the whole level. */
export function createBoxGrid(boxes: readonly Box[], cell = CELL): BoxGrid {
  const cells = new Map<number, Box[]>();
  for (const box of boxes) {
    for (let ix = Math.floor(box.minX / cell); ix <= Math.floor(box.maxX / cell); ix++) {
      for (let iz = Math.floor(box.minZ / cell); iz <= Math.floor(box.maxZ / cell); iz++) {
        const k = key(ix, iz);
        const list = cells.get(k);
        if (list) list.push(box);
        else cells.set(k, [box]);
      }
    }
  }
  const out: Box[] = [];
  const seen = new Set<Box>();
  return {
    near(x, z, radius) {
      out.length = 0;
      seen.clear();
      for (let ix = Math.floor((x - radius) / cell); ix <= Math.floor((x + radius) / cell); ix++) {
        for (let iz = Math.floor((z - radius) / cell); iz <= Math.floor((z + radius) / cell); iz++) {
          for (const box of cells.get(key(ix, iz)) ?? []) {
            if (seen.has(box)) continue;
            seen.add(box);
            out.push(box);
          }
        }
      }
      return out;
    },
  };
}
```
(`cells.get(...) ?? []` allocates only on empty cells; replace with a shared frozen `EMPTY` array constant to keep the loop allocation-free.)

In `player.ts`: keep a `let grid = createBoxGrid([])`; `setColliders(boxes) { grid = createBoxGrid(boxes); }`; in `update` resolve against `grid.near(nextX, nextZ, PLAYER_RADIUS + 0.5)`. Add `shove(dx, dz)` that runs the same `resolveCircle` from the current position. Remove the `colliders` field from the `Player` interface and update the one caller in `follow-the-river/index.ts`.

Add to `collide.ts` the ponytail note's replacement: "Use `createBoxGrid` to pass only nearby boxes."

- [ ] **Step 4: Run** `pnpm vitest run` — Expected: PASS.
- [ ] **Step 5: Commit** — `pnpm run check`; `git commit -m "feat(engine): spatial grid for colliders"`

---

### Task 3: Mouse buttons, choices, and the richer dream contract

**Files:**
- Create: `src/session.ts`
- Modify: `src/engine/input.ts`, `src/engine/input.test.ts`, `src/engine/menus.ts`, `src/dreams/types.ts`, `src/app.ts`, `src/dreams/follow-the-river/index.ts` (signature only)

**Interfaces:**
- Produces:
  ```ts
  // input.ts — mouse buttons become codes 'Mouse0' (left), 'Mouse2' (right) in the same KeyState.
  // menus.ts
  export function showChoice(overlay: Overlay, text: string, labels: readonly string[], onPick: (index: number) => void): void;
  // types.ts — DreamContext gains/changes:
  read: (pages: readonly string[], onDone?: () => void) => void;
  /** Player-paced question with buttons; resolves with the chosen index. Pauses the game. */
  choose: (text: string, labels: readonly string[]) => Promise<number>;
  /** End the dream and return to the dream cards (fades out first). */
  finish: () => void;
  ```
  `src/session.ts` exports `createSession(app: App, info: DreamInfo, onQuit: () => void): { context(dream): DreamContext; cleanUp(): void; begin(): void }` holding the player, pause menu, reader, choice and lock wiring now inside `runDream`. `runDream` keeps only load → start (with timeout) → failure restore → fade in → `begin()` (shows `info.intro`).

- [ ] **Step 1: Write the failing tests** — append to `src/engine/input.test.ts`:
```ts
function mouse(type: 'mousedown' | 'mouseup', button: number): Event {
  return Object.assign(new Event(type), { button });
}

describe('KeyState mouse buttons', () => {
  it('tracks mouse buttons as Mouse0 / Mouse2', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(mouse('mousedown', 0));
    expect(keys.isDown('Mouse0')).toBe(true);
    expect(keys.consumePress('Mouse0')).toBe(true);
    target.dispatchEvent(mouse('mouseup', 0));
    expect(keys.isDown('Mouse0')).toBe(false);
  });

  it('stops listening after detach', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    keys.detach();
    target.dispatchEvent(mouse('mousedown', 2));
    expect(keys.isDown('Mouse2')).toBe(false);
  });
});
```
(`showChoice` and the session wiring are DOM glue, checked in the browser in Step 4.)

- [ ] **Step 2: Run** `pnpm vitest run src/engine/input.test.ts` — Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

`input.ts`: add
```ts
function buttonCode(event: Event): string {
  return 'button' in event && typeof event.button === 'number' ? `Mouse${event.button}` : '';
}
```
and `onMouseDown`/`onMouseUp` handlers mirroring `onDown`/`onUp` (no repeat flag), attached/detached with `mousedown`/`mouseup` beside the key listeners.

`menus.ts`:
```ts
/** A player-paced question. Buttons only; the first one gets focus so Enter picks it. */
export function showChoice(
  overlay: Overlay,
  text: string,
  labels: readonly string[],
  onPick: (index: number) => void,
): void {
  overlay.panel((panel) => {
    const row = el('div', 'row');
    labels.forEach((label, index) => {
      row.append(
        button(label, () => {
          overlay.closePanel();
          onPick(index);
        }, index === 0 ? 'btn primary' : 'btn'),
      );
    });
    panel.append(el('p', 'page-text', text), row);
  });
  overlay.root.querySelector<HTMLButtonElement>('.panel .btn')?.focus();
}
```

`session.ts`: move from `app.ts` the lock/screen state, `createPlayer`, NO_LOCK handling, the `stopMove` updater, `showMenu`, `read`, `cleanUp`, `leave`. Add `choose` (same as `read`: `reading = true; screen = 'reader'; player.unlock(); showChoice(..., (i) => { reading = false; lock(); resolve(i); })`) and `finish` (`void app.overlay.fade(true).then(leave)`). `read(pages, onDone)` calls `onDone?.()` right after `lock()` inside the pager's done handler. Each function stays < 50 lines; `app.ts` imports `createSession`.

- [ ] **Step 4: Verify**

`pnpm run check` passes. In Chrome (`pnpm run dev`, `http://localhost:5173/?nolock`): Start → pick the dream → intro pages → walk; Esc opens the pause menu; Quit returns to the cards. (Same behaviour as before: this task is a refactor plus additions.)

- [ ] **Step 5: Commit** — `git commit -m "feat(engine): mouse buttons, choices, finish(); split session from app"`

---

### Task 4: Audio channels, sound loading, positional sounds, world pause

**Files:**
- Modify: `src/engine/audio.ts`, `src/session.ts` (mute the world while paused), `src/main.ts` (none expected)
- Create: `src/engine/audio.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Channel = 'world' | 'voice';
  export interface AudioBus {
    readonly listener: THREE.AudioListener;
    unlock(): Promise<void>;
    setVolume(volume: number): void;
    /** Fetches and decodes once per URL; a failed fetch is retried next call. */
    load(url: string): Promise<AudioBuffer>;
    loop(buffer: AudioBuffer, volume: number, channel?: Channel): THREE.Audio;
    once(buffer: AudioBuffer, volume: number, channel?: Channel): THREE.Audio;
    /** A world-channel sound attached to `parent` (groans, splashes). Caller plays/stops it. */
    positional(parent: THREE.Object3D, refDistance: number): THREE.PositionalAudio;
    /** Smoothly mutes (true) or restores the world channel. The voice channel is unaffected. */
    setWorldPaused(paused: boolean): void;
  }
  /** Loop points that skip AAC encoder padding so ambience loops don't click. */
  export function loopBounds(duration: number): { start: number; end: number };
  /** Promise cache with eviction on failure (pure, testable). */
  export function createLoadCache<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T>;
  ```

- [ ] **Step 1: Write the failing test** — `src/engine/audio.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createLoadCache, loopBounds } from './audio';

describe('loopBounds', () => {
  it('trims 50 ms from each end of a long loop', () => {
    expect(loopBounds(4)).toEqual({ start: 0.05, end: 3.95 });
  });

  it('leaves short sounds untouched', () => {
    expect(loopBounds(0.4)).toEqual({ start: 0, end: 0.4 });
  });
});

describe('createLoadCache', () => {
  it('loads each key once', async () => {
    const load = vi.fn(async (key: string) => key.length);
    const get = createLoadCache(load);
    expect(await get('abc')).toBe(3);
    expect(await get('abc')).toBe(3);
    expect(load).toHaveBeenCalledOnce();
  });

  it('forgets a failed load so the next call retries', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(7);
    const get = createLoadCache<number>(load);
    await expect(get('x')).rejects.toThrow('offline');
    expect(await get('x')).toBe(7);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/engine/audio.test.ts` — Expected: FAIL (exports missing).

- [ ] **Step 3: Implement** in `audio.ts`:
```ts
const TRIM = 0.05;

export function loopBounds(duration: number): { start: number; end: number } {
  return duration > 1 ? { start: TRIM, end: duration - TRIM } : { start: 0, end: duration };
}

export function createLoadCache<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (key) => {
    let pending = cache.get(key);
    if (!pending) {
      pending = load(key);
      pending.catch(() => cache.delete(key));
      cache.set(key, pending);
    }
    return pending;
  };
}
```
`createAudioBus`:
- `const world = listener.context.createGain(); world.connect(listener.getInput());`
- `route(sound, channel)`: for `'world'`, `sound.gain.disconnect(); sound.gain.connect(world);` (voice stays on the listener input).
- `loop()`: set `loopBounds(buffer.duration)` via `sound.setLoopStart/setLoopEnd` before `play()`.
- `once()` keeps today's `onEnded` disconnect and returns the sound.
- `positional(parent, refDistance)`: `new THREE.PositionalAudio(listener)`, `setRefDistance`, `setRolloffFactor(1.6)`, route to world, `parent.add(sound)`, return it.
- `setWorldPaused(p)`: `world.gain.setTargetAtTime(p ? 0 : 1, listener.context.currentTime, 0.05)`.
- `load = createLoadCache(async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(\`${r.status} ${url}\`); return listener.context.decodeAudioData(await r.arrayBuffer()); })`.
- Safari resume: `document.addEventListener('visibilitychange', …)`: when visible and an `unlock()` has happened, `void listener.context.resume().catch(() => undefined)`.

`session.ts`: whenever `screen` changes, call `app.audio.setWorldPaused(screen !== 'game')`; `cleanUp()` calls `app.audio.setWorldPaused(false)` so the home breathing is audible again.

- [ ] **Step 4: Verify** — `pnpm run check`. Chrome: home breathing still plays after Start; in the dream, the watcher sting stops instantly when Esc is pressed mid-sting (Plan 1 follow-up).
- [ ] **Step 5: Commit** — `git commit -m "feat(engine): audio channels, sound cache, positional audio, world pause"`

---
### Task 5: Assets — Kenney kits, people, zombies, orca, sounds, licences

**Done by the controller** (asset work needs visual judgement; the Blender scripts were iterated with renders and Chrome checks). Recorded here so the plan stays the source of truth.

**Files:**
- Create: `tools/blender/zombify.py`, `tools/blender/orca.py`, `tools/assets/README.md` (how to rebuild every asset), `public/assets/kits/{city,roads,cars,survival,suburb}/*.glb` + each kit's `Textures/colormap.png`, `public/assets/characters/{mom,zombie-m,zombie-f,orca}.glb`, `public/assets/sounds/{zombie,ambience,stings}/*.m4a`
- Modify: `public/assets/LICENSES.md`

**Interfaces (later tasks rely on these exact names):**
- `characters/zombie-m.glb`, `characters/zombie-f.glb`: one `CharacterArmature` skeleton each; one `SkinnedMesh` per outfit, named by outfit (men: `beach casual farmer hoodie punk suit swat worker`; women: `casual punk soldier suit worker`), each with its own painted texture material. Clips (identical names in both files): `Idle` (1.07 s loop), `Walk` (1.07 s loop, zombie shamble), `Run` (0.67 s loop, sprint legs + zombie arms), `Attack` (1.43 s), `Hit` (0.67 s), `Death` (2.4 s, ends lying down), `GetUp` (1.23 s, lying → standing). Models face three `+Z`, feet at y = 0, about 1.75 m tall.
- `characters/mom.glb`: Quaternius Ultimate Modular Women "Formal" (never used as a zombie). Clips are `CharacterArmature|<name>`: `Idle`, `Walk`, `Run`, `Interact`, `Idle_Gun_Pointing` (reads as filming with a phone), `Wave`, `Death`, …
- `characters/orca.glb`: 7 m orca, head toward three `−Z`, origin at its centre; clips `Swim` (1.67 s loop) and `Lunge` (1.0 s, rears up). Materials `orca-black`, `orca-white`, `orca-grey`.
- Kenney kits, one folder each (their `colormap.png` files differ): `kits/city` (building-a…h, building-skyscraper-a/b, low-detail-building-a…d, detail-awning), `kits/roads` (road-straight, road-crossroad, light-square, dumpster, construction-barrier, construction-cone, construction-fence, electricity-pole), `kits/cars` (police, sedan, taxi, van, ambulance, garbage-truck, suv, delivery), `kits/survival` (structure-metal-wall, structure-metal-doorway, structure-metal-roof, structure-metal-floor, barrel, box, box-large, campfire-pit, bedroll, fish-large, bottle, fence, chest), `kits/suburb` (building-type-a…h, fence-1x3, fence-2x3, tree-large, tree-small, driveway-long).
- Sounds (AAC in `.m4a`, mono, 64 kb/s, from CC0 sources; `afconvert -f m4af -d aac -b 64000 -c 1`): `sounds/zombie/groan-01…24.m4a`, `sounds/ambience/{water,wind,night-1,night-2,night-3}.m4a`, `sounds/stings/{weird-1,weird-2,weird-3,alarm}.m4a`.

- [ ] **Step 1:** Run `tools/blender/zombify.py` and `tools/blender/orca.py` headless (commands in each file's docstring) into `public/assets/characters/`; copy Mom's GLB as `mom.glb`.
- [ ] **Step 2:** Copy the kit subsets (each kit's `Textures/colormap.png` beside its GLBs).
- [ ] **Step 3:** Convert the sounds with `afconvert`; drop macOS `__MACOSX`/`.DS_Store` junk.
- [ ] **Step 4:** Add every source to `LICENSES.md` (Kenney kits, Quaternius Ultimate Modular Men/Women + Universal Animation Library 1 & 2, OpenGameArt "Zombies Sound Pack" by artisticdude, the CC0 loops pack, and our own Blender props/orca), and write `tools/assets/README.md` with the rebuild commands.
- [ ] **Step 5:** Verify: `python3 glbinfo.py` on every character (clip names above), total `public/assets` size < 25 MB, `pnpm run check`. Commit `feat(assets): Kenney kits, zombie people, orca, Mom, zombie and ambience sounds`.

---

### Task 6: Blender props for Dream 1

**Files:**
- Create: `tools/blender/dream1_props.py`, `public/assets/props/{bow,arrow,arrows,battery,tape,fishpack,tv,couch,livingroom,boathouse}.glb`

**Interfaces:**
- Produces GLBs with these contracts (later tasks rely on them):

| File | Size (m) | Origin / facing | Material names (code may look these up) |
|---|---|---|---|
| `bow.glb` | 1.2 tall recurve, 0.15 deep | origin at the grip; limbs along +Y (three), string on the −Z… no: string toward +Z (the player), belly toward −Z | `wood`, `string` |
| `arrow.glb` | shaft 0.75 long, 8 mm | origin at shaft centre; tip toward three −Z | `shaft`, `tip`, `fletch` |
| `arrows.glb` | bundle of 3 arrows tied with a band | lies flat, origin at the centre bottom | `shaft`, `tip`, `fletch`, `band` |
| `battery.glb` | D cell, Ø 0.034 × 0.06, scaled ×2 so it reads in the dark | standing, origin at bottom centre | `metal`, `glowBand` (emissive yellow 1.5) |
| `tape.glb` | cassette 0.10 × 0.064 × 0.012, scaled ×2 | flat, origin at bottom centre | `plastic`, `label` (emissive off-white 0.6) |
| `fishpack.glb` | styrofoam tray 0.30 × 0.18 with two fish under plastic | flat, origin at bottom centre | `tray`, `fish`, `wrap` (emissive pale blue 0.4) |
| `tv.glb` | CRT 0.7 × 0.55 × 0.5 on a low stand 0.5 tall | front faces three +Z, origin at floor centre | `case`, `Screen` (a separate quad; code swaps its material) |
| `couch.glb` | 2.0 × 0.9 × 0.85 | front faces three −Z, origin at floor centre | `fabric`, `wood` |
| `livingroom.glb` | room shell 7 × 5 × 2.8, walls 0.15 thick, a doorway 1.1 × 2.1 in the −X wall at z = +1.2, a window 1.4 × 1.0 in the +Z wall | origin at floor centre; floor, ceiling and inside walls only | `wall`, `floor`, `ceiling`, `windowGlass` (emissive dull blue 0.3) |
| `boathouse.glb` | 6 × 5 × 3.2 timber shed on a dock, open toward +X (the river), a lantern hanging inside | origin at floor centre | `timber`, `roof`, `lantern` (emissive warm 3.0) |

Blender → glTF axes: Blender `+Z` → three `+Y`; Blender `−Y` → three `+Z`; Blender `+Y` → three `−Z`. So "tip toward three −Z" = model it pointing along Blender `+Y`.

- [ ] **Step 1: Write the script**

Follow the structure of `tools/blender/river_props.py` (copy its `reset`, `material`, `box`, `join`, `export` helpers; output folder from the argument after `--`, default `public/assets/props`). One function per prop, each starting with `reset()` and ending with `export(name)`. Low poly but smooth where organic: cylinders 8–12 vertices, `shade_smooth()` on the bow and fish; flat on boxes. Dark, desaturated colours (never bright), except the emissive markers above, which exist so pickups can be found in the dark.

Key shapes:
- **bow:** two limbs from a bent cylinder (`primitive_cylinder_add` 8 verts, a `SIMPLE_DEFORM` BEND modifier applied) with recurved tips; a 6 mm string cylinder from tip to tip; a wrapped grip (slightly thicker cylinder).
- **arrow:** shaft cylinder; cone tip (6 verts); three thin fletch planes (`box` 0.12 × 0.002 × 0.03) at 120°.
- **tv:** case box with a slightly recessed `Screen` quad (`primitive_plane_add`, its own object joined last so it keeps its own material slot); two knobs; stand box.
- **livingroom:** build the shell from `box` walls with the doorway and window gaps (no boolean modifiers); add a skirting line; normals face inward (it is seen from inside).
- **boathouse:** plank-like boxes for the walls (3 sides), a pitched roof from two rotated boxes, a dock floor extending 2 m toward +X, a lantern (small box + emissive cube) hanging from the ridge.

- [ ] **Step 2: Run it headless**

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python tools/blender/dream1_props.py -- public/assets/props
```
Expected: last line `EXPORTED ['arrow.glb', 'arrows.glb', 'battery.glb', 'boathouse.glb', 'bow.glb', 'couch.glb', 'fishpack.glb', 'livingroom.glb', 'tape.glb', 'tv.glb']`.

- [ ] **Step 3: Check sizes**

`python3 <scratchpad>/glbsize.py public/assets/props/*.glb` (the controller gives you the path) — every size within ±15 % of the table; every file < 150 KB.

- [ ] **Step 4: Commit**

`git add tools/blender/dream1_props.py public/assets/props && git commit -m "feat(assets): Blender props for Follow the River (bow, arrows, pickups, TV, rooms)"` — do **not** edit `LICENSES.md` (the controller adds the line).

---

### Task 7: Run state — phases, supplies, checkpoints, save shape

**Files:**
- Create: `src/dreams/follow-the-river/state.ts`, `src/dreams/follow-the-river/state.test.ts`

**Interfaces:**
- Produces (exact):
  ```ts
  export type Phase = 'intro' | 'day1' | 'night1' | 'day2' | 'night2' | 'day3' | 'night3' | 'end';
  export const PHASES: readonly Phase[];
  export function nextPhase(phase: Phase): Phase;
  export function isNight(phase: Phase): boolean;
  /** 1–3 for day/night phases, 0 for intro and end. */
  export function chapterOf(phase: Phase): 0 | 1 | 2 | 3;
  export interface Supplies { battery: number; arrows: number; ammo: number; fishPacks: number }
  export type SupplyKind = keyof Supplies;
  export const START_SUPPLIES: Readonly<Supplies>;
  export const SUPPLY_LIMITS: Readonly<Supplies>;
  export function addSupply(supplies: Supplies, kind: SupplyKind, amount: number): Supplies;
  /** New supplies after spending, or null when there isn't enough. */
  export function spend(supplies: Supplies, kind: SupplyKind, amount: number): Supplies | null;
  export interface RunState { supplies: Supplies; fed: number; taken: string[]; tapes: number[]; hints: string[] }
  export interface RunSave extends RunState { version: 1; phase: Phase }
  export function freshRun(): RunSave;
  export function isRunSave(value: unknown): value is RunSave;
  /** The live state at the start of `save.phase` (deep copy), keeping hints already seen. */
  export function restartPhase(save: RunSave, hintsSeen?: readonly string[]): RunState;
  /** Checkpoint after finishing `save.phase` with `live`. Fish fed by day carries into that night only. */
  export function completePhase(save: RunSave, live: RunState): RunSave;
  ```

- [ ] **Step 1: Write the failing test** — `state.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  addSupply,
  chapterOf,
  completePhase,
  freshRun,
  isNight,
  isRunSave,
  nextPhase,
  restartPhase,
  spend,
  START_SUPPLIES,
  SUPPLY_LIMITS,
} from './state';

describe('phases', () => {
  it('runs intro → day1 → night1 → … → end and stays at end', () => {
    expect(nextPhase('intro')).toBe('day1');
    expect(nextPhase('day1')).toBe('night1');
    expect(nextPhase('night3')).toBe('end');
    expect(nextPhase('end')).toBe('end');
  });

  it('knows nights and chapters', () => {
    expect([isNight('night2'), isNight('day2')]).toEqual([true, false]);
    expect([chapterOf('intro'), chapterOf('day1'), chapterOf('night3'), chapterOf('end')]).toEqual([0, 1, 3, 0]);
  });
});

describe('supplies', () => {
  it('adds up to the limit', () => {
    const full = addSupply(START_SUPPLIES, 'battery', 1000);
    expect(full.battery).toBe(SUPPLY_LIMITS.battery);
  });

  it('never goes negative and does not mutate', () => {
    const before = { ...START_SUPPLIES };
    expect(addSupply(START_SUPPLIES, 'arrows', -999).arrows).toBe(0);
    expect(START_SUPPLIES).toEqual(before);
  });

  it('refuses to spend what you do not have', () => {
    const none = { ...START_SUPPLIES, fishPacks: 0 };
    expect(spend(none, 'fishPacks', 1)).toBeNull();
    expect(spend(START_SUPPLIES, 'arrows', 1)?.arrows).toBe(START_SUPPLIES.arrows - 1);
  });
});

describe('saves', () => {
  it('accepts a fresh run', () => {
    expect(isRunSave(freshRun())).toBe(true);
  });

  it.each([
    null,
    42,
    {},
    { ...freshRun(), version: 2 },
    { ...freshRun(), phase: 'day9' },
    { ...freshRun(), supplies: { battery: 'full' } },
    { ...freshRun(), supplies: { ...START_SUPPLIES, arrows: -1 } },
    { ...freshRun(), supplies: { ...START_SUPPLIES, arrows: Number.NaN } },
    { ...freshRun(), taken: 'all' },
    { ...freshRun(), tapes: [1, 'two'] },
    { ...freshRun(), fed: Infinity },
  ])('rejects a corrupt save %#', (value) => {
    expect(isRunSave(value)).toBe(false);
  });
});

describe('checkpoints', () => {
  it('restarts a phase with the supplies it began with, keeping hints seen since', () => {
    const save = { ...freshRun(), phase: 'night1' as const, fed: 2 };
    const live = restartPhase(save, ['flashlight']);
    live.supplies.arrows = 0;
    live.taken.push('battery-3');
    const again = restartPhase(save, live.hints);
    expect(again.supplies).toEqual(save.supplies);
    expect(again.taken).toEqual(save.taken);
    expect(again.fed).toBe(2);
    expect(again.hints).toContain('flashlight');
  });

  it('carries fish fed by day into that night, then clears it for the next day', () => {
    const day = { ...freshRun(), phase: 'day1' as const };
    const night = completePhase(day, { ...restartPhase(day), fed: 3 });
    expect([night.phase, night.fed]).toEqual(['night1', 3]);
    const nextDay = completePhase(night, restartPhase(night));
    expect([nextDay.phase, nextDay.fed]).toEqual(['day2', 0]);
  });

  it('keeps what was found when a phase is completed', () => {
    const day = { ...freshRun(), phase: 'day1' as const };
    const live = { ...restartPhase(day), taken: ['tape-1'], tapes: [1] };
    const night = completePhase(day, live);
    expect([night.taken, night.tapes]).toEqual([['tape-1'], [1]]);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/dreams/follow-the-river/state.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `state.ts`:
```ts
export type Phase = 'intro' | 'day1' | 'night1' | 'day2' | 'night2' | 'day3' | 'night3' | 'end';
export const PHASES: readonly Phase[] = ['intro', 'day1', 'night1', 'day2', 'night2', 'day3', 'night3', 'end'];

export function nextPhase(phase: Phase): Phase {
  return PHASES[Math.min(PHASES.indexOf(phase) + 1, PHASES.length - 1)] ?? 'end';
}

export function isNight(phase: Phase): boolean {
  return phase.startsWith('night');
}

export function chapterOf(phase: Phase): 0 | 1 | 2 | 3 {
  const n = Number(phase.slice(-1));
  return n === 1 || n === 2 || n === 3 ? n : 0;
}

export interface Supplies {
  battery: number;
  arrows: number;
  ammo: number;
  fishPacks: number;
}
export type SupplyKind = keyof Supplies;

/** What you carry when Mom sends you off. Tuning knobs. */
export const START_SUPPLIES: Readonly<Supplies> = { battery: 100, arrows: 6, ammo: 0, fishPacks: 1 };
export const SUPPLY_LIMITS: Readonly<Supplies> = { battery: 100, arrows: 20, ammo: 24, fishPacks: 5 };

export function addSupply(supplies: Supplies, kind: SupplyKind, amount: number): Supplies {
  const value = Math.max(0, Math.min(SUPPLY_LIMITS[kind], supplies[kind] + amount));
  return { ...supplies, [kind]: value };
}

export function spend(supplies: Supplies, kind: SupplyKind, amount: number): Supplies | null {
  return supplies[kind] >= amount ? addSupply(supplies, kind, -amount) : null;
}

export interface RunState {
  supplies: Supplies;
  /** Fish packs thrown into the river this chapter (powers that night's strikes). */
  fed: number;
  /** Pickup ids already collected (they never respawn). */
  taken: string[];
  tapes: number[];
  hints: string[];
}

export interface RunSave extends RunState {
  version: 1;
  /** The phase to play next; `supplies` etc. are the checkpoint at its start. */
  phase: Phase;
}

export function freshRun(): RunSave {
  return { version: 1, phase: 'intro', supplies: { ...START_SUPPLIES }, fed: 0, taken: [], tapes: [], hints: [] };
}

const count = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const list = <T>(v: unknown, item: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.every(item);
const text = (v: unknown): v is string => typeof v === 'string';

function isSupplies(v: unknown): v is Supplies {
  return record(v) && count(v.battery) && count(v.arrows) && count(v.ammo) && count(v.fishPacks);
}

export function isRunSave(value: unknown): value is RunSave {
  if (!record(value) || value.version !== 1) return false;
  return (
    PHASES.includes(value.phase as Phase) &&
    isSupplies(value.supplies) &&
    count(value.fed) &&
    list(value.taken, text) &&
    list(value.tapes, count) &&
    list(value.hints, text)
  );
}

export function restartPhase(save: RunSave, hintsSeen: readonly string[] = []): RunState {
  return {
    supplies: { ...save.supplies },
    fed: save.fed,
    taken: [...save.taken],
    tapes: [...save.tapes],
    hints: [...new Set([...save.hints, ...hintsSeen])],
  };
}

export function completePhase(save: RunSave, live: RunState): RunSave {
  const phase = nextPhase(save.phase);
  return {
    version: 1,
    phase,
    supplies: { ...live.supplies },
    fed: isNight(phase) ? live.fed : 0,
    taken: [...live.taken],
    tapes: [...live.tapes],
    hints: [...live.hints],
  };
}
```
(If `PHASES.includes(value.phase as Phase)` trips the lint's unsafe-assertion rule, use `typeof value.phase === 'string' && (PHASES as readonly string[]).includes(value.phase)`.)

- [ ] **Step 4: Run** `pnpm vitest run src/dreams/follow-the-river/state.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `pnpm run check`; `git commit -m "feat(river): run state — phases, supplies, checkpoints, save validation"`

---

### Task 8: The world — lighting presets with sun and moon, river, kits, shacks, `buildWorld`

**Files:**
- Create: `src/dreams/follow-the-river/{lighting,river,kits,shack,world}.ts`, `src/dreams/follow-the-river/areas/types.ts`, tests `lighting.test.ts`, `shack.test.ts`, `world.test.ts`
- Modify: `src/engine/sky.ts` (add `paintSkyDome`), `src/dreams/follow-the-river/skyline.ts` (accept a style + strip length)
- Delete: `src/dreams/follow-the-river/riverbank.ts`, `riverbank.test.ts` (their constants move to `river.ts`; keep the watcher)

**Interfaces:**
- Consumes: `createSkyDome`, `loadModel`, `assetUrl`, `boxAt`, `createRiverMaterial`, `addSkyline`.
- Produces:
  ```ts
  // river.ts — moved from riverbank.ts, same values
  export const RIVER_WIDTH = 14; export const RIVER_X = 3 + RIVER_WIDTH / 2; export const EDGE_X = 3;
  export function addRiver(scene: THREE.Scene, fromZ: number, toZ: number): void; // water, both banks, mud edge
  // kits.ts
  export type Kit = 'city' | 'roads' | 'cars' | 'survival' | 'suburb';
  export const KIT_SCALE: Readonly<Record<Kit, number>>; // city 10, roads 6, cars 1, survival 6, suburb 8
  export function kitUrl(kit: Kit, model: string): string;   // assetUrl(`kits/${kit}/${model}.glb`)
  export function propUrl(name: string): string;             // assetUrl(`props/${name}.glb`)
  export function characterUrl(name: 'mom' | 'zombie-m' | 'zombie-f' | 'orca'): string;
  // lighting.ts
  export type LightingName = 'dusk' | 'day' | 'night';
  export interface LightPreset {
    skyTop: number; skyHorizon: number;
    fog: { color: number; near: number; far: number };
    hemi: { sky: number; ground: number; intensity: number };
    key: { color: number; intensity: number; elevation: number; azimuth: number };
    disc: { color: number; size: number };
  }
  export const LIGHTING: Readonly<Record<LightingName, LightPreset>>;
  export interface WorldLights { hemi: THREE.HemisphereLight; key: THREE.DirectionalLight; disc: THREE.Mesh; sky: THREE.Mesh; scene: THREE.Scene }
  export function createWorldLights(scene: THREE.Scene): WorldLights;
  export function applyLighting(lights: WorldLights, preset: LightPreset, dim?: number): void; // dim 0..1 darkens hemi+key (inside shacks)
  /** Unit direction toward the sun/moon from elevation/azimuth (radians). */
  export function skyDirection(elevation: number, azimuth: number): { x: number; y: number; z: number };
  // areas/types.ts
  export interface Spot { x: number; z: number; yaw: number }
  export interface PropPlacement { kit: Kit; model: string; x: number; z: number; yaw?: number; scale?: number; collide?: boolean }
  export interface ShackDef { id: string; x: number; z: number; width: number; depth: number } // tiles; door faces +X (the road/river)
  export type PickupKind = 'battery' | 'arrows' | 'fishPack' | 'tape' | 'ammo';
  export interface PickupDef { id: string; kind: PickupKind; x: number; z: number; tape?: number }
  /** `lying`: starts on the ground like a corpse and gets up when the player comes close. */
  export interface LurkerDef { x: number; z: number; yaw: number; lying?: boolean }
  export type ScareDef =
    | { kind: 'watcher'; x: number; z: number; trigger: number }
    | { kind: 'ambush'; shack: string; trigger: number }
    | { kind: 'alarm'; x: number; z: number; trigger: number };
  export interface AreaDef {
    id: 'city' | 'suburbs' | 'forest';
    ground: number; farBank: number;
    skyline: 'city' | 'houses' | 'trees';
    /** Land side of the play strip (x), the river edge is EDGE_X. */
    landX: number;
    /** Strip ends: the start blocker (z, positive) and the far end (z, negative). */
    startZ: number; endZ: number;
    daySpawn: Spot; waitSpot: Spot; barricadeZ: number; nightStart: Spot; safeZ: number;
    props: readonly PropPlacement[]; shacks: readonly ShackDef[];
    pickups: readonly PickupDef[]; lurkers: readonly LurkerDef[]; scares: readonly ScareDef[];
  }
  // shack.ts
  export const SHACK_TILE: number; // 0.54 * KIT_SCALE.survival ≈ 3.24 m
  /** Wall colliders for a shack, leaving the doorway (middle tile of the +X side) open. */
  export function shackColliders(def: ShackDef): Box[];
  /** Footprint (for "am I inside?" checks). */
  export function shackBounds(def: ShackDef): Box;
  export async function addShack(scene: THREE.Scene, def: ShackDef): Promise<void>;
  // world.ts
  export interface World { scene: THREE.Scene; colliders: Box[]; lights: WorldLights; insideShack(x: number, z: number): boolean }
  export async function buildWorld(area: AreaDef): Promise<World>;
  ```

- [ ] **Step 1: Write the failing tests**

`lighting.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LIGHTING, skyDirection } from './lighting';

const brightness = (hex: number): number => ((hex >> 16) + ((hex >> 8) & 255) + (hex & 255)) / 765;

describe('LIGHTING', () => {
  it('is never bright: sky and fog stay dark in every preset', () => {
    for (const preset of Object.values(LIGHTING)) {
      expect(brightness(preset.skyHorizon)).toBeLessThan(0.4);
      expect(brightness(preset.fog.color)).toBeLessThan(0.4);
      expect(preset.key.intensity).toBeLessThanOrEqual(0.6);
    }
  });

  it('makes night darker than day', () => {
    expect(LIGHTING.night.hemi.intensity).toBeLessThan(LIGHTING.day.hemi.intensity);
    expect(LIGHTING.night.fog.far).toBeLessThan(LIGHTING.day.fog.far);
  });

  it('puts the sun and moon above the horizon', () => {
    for (const preset of Object.values(LIGHTING)) {
      expect(skyDirection(preset.key.elevation, preset.key.azimuth).y).toBeGreaterThan(0);
    }
  });
});

describe('skyDirection', () => {
  it('is a unit vector', () => {
    const d = skyDirection(0.4, 1.2);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
  });
});
```

`shack.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../engine/collide';
import { SHACK_TILE, shackBounds, shackColliders } from './shack';

const def = { id: 's1', x: -14, z: -20, width: 3, depth: 2 };

describe('shack', () => {
  it('has a footprint of width × depth tiles centred on (x, z)', () => {
    const b = shackBounds(def);
    expect(b.maxX - b.minX).toBeCloseTo(2 * SHACK_TILE); // depth runs along x (door faces +X)
    expect(b.maxZ - b.minZ).toBeCloseTo(3 * SHACK_TILE);
  });

  it('lets the player walk in through the doorway on the +X side', () => {
    const b = shackBounds(def);
    const walls = shackColliders(def);
    // Walk from outside the door straight in along -X.
    let x = b.maxX + 1;
    for (let i = 0; i < 40; i++) ({ x } = resolveCircle(x - 0.1, def.z, 0.3, walls));
    expect(x).toBeLessThan(b.maxX - 0.5);
  });

  it('blocks walking through a side wall', () => {
    const b = shackBounds(def);
    const walls = shackColliders(def);
    let z = b.maxZ + 1;
    for (let i = 0; i < 40; i++) ({ z } = resolveCircle(def.x, z - 0.1, 0.3, walls));
    expect(z).toBeGreaterThan(b.maxZ);
  });
});
```

`world.test.ts` (the pure part only — `buildWorld` loads models and is checked in Chrome):
```ts
import { describe, expect, it } from 'vitest';
import { KIT_SCALE, kitUrl } from './kits';

describe('kits', () => {
  it('keeps each kit in its own folder (their colormap.png files differ)', () => {
    expect(kitUrl('city', 'building-a')).toMatch(/assets\/kits\/city\/building-a\.glb$/);
    expect(kitUrl('cars', 'police')).toMatch(/assets\/kits\/cars\/police\.glb$/);
  });

  it('scales every kit to metres', () => {
    expect(KIT_SCALE).toEqual({ city: 10, roads: 6, cars: 1, survival: 6, suburb: 8 });
  });
});
```

- [ ] **Step 2: Run** the three tests — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

Preset values (tuning knobs; keep them in `lighting.ts`):
```ts
export const LIGHTING: Readonly<Record<LightingName, LightPreset>> = {
  // Intro: the evening Mom sends you off. Low, rusty sun behind smoke.
  dusk: {
    skyTop: 0x0b0d14, skyHorizon: 0x3a2a2a,
    fog: { color: 0x2a2224, near: 8, far: 80 },
    hemi: { sky: 0x6a5a60, ground: 0x15120f, intensity: 0.55 },
    key: { color: 0xc08060, intensity: 0.35, elevation: 0.14, azimuth: -2.4 },
    disc: { color: 0x8a5a40, size: 6 },
  },
  // Overcast day: flat grey, a pale sun disc barely through the haze. Never bright.
  day: {
    skyTop: 0x2c3136, skyHorizon: 0x50565b,
    fog: { color: 0x4a5055, near: 10, far: 90 },
    hemi: { sky: 0x8a9098, ground: 0x24261f, intensity: 0.75 },
    key: { color: 0xd0d4d8, intensity: 0.45, elevation: 0.6, azimuth: -2.0 },
    disc: { color: 0x9ea2a4, size: 7 },
  },
  // Night: blue-black, a small cold moon that blooms.
  night: {
    skyTop: 0x05070b, skyHorizon: 0x1b2026,
    fog: { color: 0x141a20, near: 5, far: 55 },
    hemi: { sky: 0x3a4450, ground: 0x0c0e0a, intensity: 0.35 },
    key: { color: 0x9fb4ff, intensity: 0.35, elevation: 0.5, azimuth: -2.6 },
    disc: { color: 0xdfe8ff, size: 4 },
  },
};
```
`skyDirection(e, a) = { x: cos(e)·sin(a), y: sin(e), z: cos(e)·cos(a) }`.

`createWorldLights(scene)`: one `HemisphereLight`, one `DirectionalLight` (no shadows), the sky dome (`createSkyDome`, radius 80, named `SKY_NAME`), and one disc: `new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false }))` added **as a child of the sky dome** so it follows the player; `renderOrder` 0 (after the dome). `applyLighting` only changes colours, intensities, positions, fog values and the dome's vertex colours (`paintSkyDome(dome, top, horizon)` — split out of `createSkyDome`, sets `needsUpdate`). It never changes `visible` or adds/removes lights (that recompiles shaders). The disc sits at `skyDirection × 70`, faces the centre (`lookAt(0, 0, 0)` in dome space), scaled by `size`; the key light's position is `skyDirection × 60` relative to the player — the caller moves it with the sky each frame. `dim` multiplies hemi and key intensity by `1 − 0.7·dim`.

`river.ts`: move `RIVER_WIDTH`, `RIVER_X`, the water, far bank, ground and mud-edge code out of `riverbank.ts` into `addRiver(scene, fromZ, toZ)`; planes run 120 m past each end of the strip so fog, not an edge, ends the view.

`shack.ts`: `SHACK_TILE = 0.54 * KIT_SCALE.survival`. The door side is +X. `shackBounds` = `boxAt(x, z, depth·tile, width·tile)`. `shackColliders` = 0.2 m-thick boxes for the −X wall, both ±Z walls, and the +X wall split around a 1.4 m gap centred on `z`. `addShack` places `structure-metal-wall` pieces around the edge (`structure-metal-doorway` for the middle +X tile), `structure-metal-roof` tiles on top and `structure-metal-floor` tiles below, all from the survival kit at `KIT_SCALE.survival`. Load one piece, read its `Box3` in the browser, and adjust rotation/offset so the seams meet (Kenney pieces pivot at one corner — measure, don't guess).

`world.ts` `buildWorld(area)`: new scene; `createWorldLights`; `addRiver(scene, area.startZ, area.endZ)`; ground colour from the area; `addSkyline` (pass the style and the strip ends); every `PropPlacement` via `loadModel(kitUrl(...))`, scaled by `KIT_SCALE[kit] × (scale ?? 1)`, rotated by `yaw`; when `collide`, add a collider from its world `Box3` footprint (`boxAt` of the box's centre and size, shrunk 5 %); every shack via `addShack` + `shackColliders`; strip blockers: the river box, a land-side wall at `landX − 1`, an end wall at `startZ + 1` and `endZ − 1`, and the barricade line at `barricadeZ` (from `landX` to `EDGE_X`). `insideShack(x, z)` tests the shack bounds. Loads run in parallel (`Promise.all`).

- [ ] **Step 4: Run** `pnpm vitest run` — Expected: PASS. `pnpm run check` passes (the old dream's `index.ts` still compiles: point it at `river.ts` and `createWorldLights` until Task 16 rewrites it).

- [ ] **Step 5: Commit** — `git commit -m "feat(river): world builder, sun/moon lighting presets, shacks, kits"`

---

### Task 9: The city — Day 1 / Night 1 layout

**Files:**
- Create: `src/dreams/follow-the-river/areas/city.ts`, `src/dreams/follow-the-river/areas/city.test.ts`

**Interfaces:**
- Consumes: `AreaDef` and friends (Task 8), `shackBounds`, `shackColliders`, `EDGE_X`.
- Produces: `export const CITY: AreaDef;`

Layout (z runs downstream toward −z; river edge x = 3; road centre x = −5; shacks open toward the road):
- Strip: `landX: -18`, `startZ: 14`, `endZ: -415`, `barricadeZ: -120`, `safeZ: -400`.
- `daySpawn {x: 0, z: 6, yaw: 0}`; `waitSpot {x: 1.5, z: -113, yaw: Math.PI}` (campfire + bedroll at the river); `nightStart {x: 1.5, z: -124, yaw: 0}`.
- Shacks (width 3, depth 2 tiles, front at x ≈ −10.5): `s1` z −14, `s2` z −32, `s3` z −52, `s4` z −74, `s5` z −96.
- Pickups: `battery-1` in s1, `battery-2` under the van (x −3, z −60), `battery-3` in s4; `arrows-1` in s2, `arrows-2` in s4, `arrows-3` by a dumpster (x −9, z −82); `fish-1` in s2, `fish-2` in s5; `tape-1` (tape 1) at the back of s3. Pickups inside shacks sit 1 m from the back wall.
- Lurkers: inside s1, s3, s4, s5 (facing the door; the s4 one `lying`), plus one `lying` on the road at (−6, −70) beside the van.
- Scares: `watcher` at (−15, −40) trigger 12 (seen down the alley between s2 and s3); `ambush` in s3 trigger 1.5 (fires when the tape is picked up); `alarm` at the van (−4, −66) trigger 4.
- Props (collide unless noted): garbage truck + 2 sedans across the road at z 12 (start blocker); road tiles `road-straight` every 6 m from z 12 to −410 at x −5 (no collide); street lights `light-square` every 18 m at x −8.5 (no collide); police car crashed at (−4, −24, yaw 0.4); sedan (−6, −44); van (−4, −66, yaw −0.2); taxi (−5, −88); ambulance (−3, −116); dumpsters, barrels, boxes near shacks; Kenney city buildings behind the shacks at x −24…−30 every ~14 m from z 10 to −250 (`building-a…h`, `skyscraper-a/b`, yaw −π/2 so fronts face the river); construction fence + barriers across the strip at the barricade (z −120); from z −250 to −400 suburb fences, `tree-large`, electricity poles (outskirts); the `boathouse` prop at (0, −402) on the bank (from `props/`, loaded by the chapter, not here).

- [ ] **Step 1: Write the failing test** — `city.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../../engine/collide';
import { EDGE_X } from '../river';
import { shackBounds, shackColliders } from '../shack';
import { CITY } from './city';

const inside = (x: number, z: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean =>
  x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

describe('CITY', () => {
  it('has unique pickup ids and exactly one tape', () => {
    const ids = CITY.pickups.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CITY.pickups.filter((p) => p.kind === 'tape')).toHaveLength(1);
  });

  it('keeps every spot on the walkable strip', () => {
    for (const s of [CITY.daySpawn, CITY.waitSpot, CITY.nightStart]) {
      expect(s.x).toBeGreaterThan(CITY.landX);
      expect(s.x).toBeLessThan(EDGE_X);
    }
    expect(CITY.daySpawn.z).toBeGreaterThan(CITY.barricadeZ);
    expect(CITY.waitSpot.z).toBeGreaterThan(CITY.barricadeZ);
    expect(CITY.nightStart.z).toBeLessThan(CITY.barricadeZ);
    expect(CITY.safeZ).toBeGreaterThan(CITY.endZ);
  });

  it('places day pickups and lurkers before the barricade, not inside shack walls', () => {
    const walls = CITY.shacks.flatMap(shackColliders);
    for (const p of [...CITY.pickups, ...CITY.lurkers]) {
      expect(p.z).toBeGreaterThan(CITY.barricadeZ);
      const pushed = resolveCircle(p.x, p.z, 0.3, walls);
      expect(Math.hypot(pushed.x - p.x, pushed.z - p.z)).toBeLessThan(1e-6);
    }
  });

  it('puts every shack pickup inside its shack', () => {
    const shackPickups = CITY.pickups.filter((p) => p.id !== 'battery-2' && p.id !== 'arrows-3');
    for (const p of shackPickups) {
      expect(CITY.shacks.some((s) => inside(p.x, p.z, shackBounds(s)))).toBe(true);
    }
  });

  it('references real shacks from its ambush scares', () => {
    const ids = new Set(CITY.shacks.map((s) => s.id));
    for (const scare of CITY.scares) if (scare.kind === 'ambush') expect(ids.has(scare.shack)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `areas/city.ts` as data. Generate the repeated props (road tiles, street lights, background buildings, outskirts trees/fences) with small helper functions in the same file (`row(kit, model, fromZ, toZ, step, x, extra?)`), so the file stays well under 500 lines. Use a seeded random (copy `seeded()` from `skyline.ts`, or export it from there) for building picks so the city is the same every visit.
- [ ] **Step 4: Run** `pnpm vitest run` — PASS. Then a **visual check** (the controller does this in Chrome): temporarily point the dream at `buildWorld(CITY)` with `LIGHTING.day`, walk the strip with `?nolock`; buildings must not float or overlap the road, shacks must be enterable, the barricade must block.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): city layout for Day 1 and Night 1"`

---

### Task 10: Pure combat logic — ray hits, zombie brain, night spawner

**Files:**
- Create: `src/engine/ray.ts`, `src/engine/ray.test.ts`, `src/dreams/follow-the-river/zombies/brain.ts`, `brain.test.ts`, `zombies/spawner.ts`, `spawner.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // engine/ray.ts
  /** Distance along a unit ray to the first hit on a sphere, or null. */
  export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
    cx: number, cy: number, cz: number, radius: number): number | null;
  /** Whether `target` is inside a cone from `eye` along unit `look` (half-angle in radians, range in m). */
  export function inCone(eye: Vec3, look: Vec3, target: Vec3, range: number, halfAngle: number): boolean;
  export interface Vec3 { x: number; y: number; z: number }
  // zombies/brain.ts
  export type ZombieState = 'lying' | 'rising' | 'idle' | 'chase' | 'attack' | 'recover' | 'stunned' | 'dying' | 'taken' | 'dead';
  export type Intent = 'lie' | 'rise' | 'stand' | 'walk' | 'run' | 'strike' | 'stagger' | 'fall' | 'dragged';
  export interface Tuning { sight: number; speed: number; giveUp: number }
  export const DAY_TUNING: Tuning; export const NIGHT_TUNING: Tuning;
  export const ATTACK: { range: number; windup: number; recover: number; damage: number };
  export const STUN: { exposure: number; seconds: number };
  export const FALL_SECONDS: number; export const TAKEN_SECONDS: number;
  /** A lying zombie wakes when the player is this close (m) or makes noise, then takes RISE_SECONDS to get up. */
  export const WAKE: number; export const RISE_SECONDS: number;
  export interface Mind { state: ZombieState; timer: number; exposure: number }
  export interface Senses { distance: number; lit: boolean; heard: boolean }
  /** `lying`: starts on the ground (a corpse that isn't one — day scares). */
  export function newMind(lying?: boolean): Mind;
  /** Advance one mind by dt (mutates it — one per zombie, no allocation). Returns the intent and whether a blow landed this frame. */
  export function think(mind: Mind, senses: Senses, tuning: Tuning, dt: number, out: Thought): Thought;
  export interface Thought { intent: Intent; hit: boolean }
  export function isAlive(mind: Mind): boolean;
  export function kill(mind: Mind): void;          // → dying (arrow, bullet)
  export function takeByFish(mind: Mind): void;    // → taken
  // zombies/spawner.ts
  export const SPAWNER: { interval: number; cap: number; minDistance: number; maxDistance: number; ahead: number; quietNearSafe: number };
  export interface Strip { minX: number; maxX: number; minZ: number; maxZ: number }
  export interface SpawnPoint { x: number; z: number }
  /** Where to put the next night zombie, or null (cap reached, timer running, or no valid spot). */
  export function nextSpawn(state: { timer: number }, dt: number, alive: number, player: { x: number; z: number },
    strip: Strip, safeZ: number, blocked: (x: number, z: number) => boolean, random: () => number): SpawnPoint | null;
  ```

- [ ] **Step 1: Write the failing tests**

`engine/ray.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { inCone, raySphere } from './ray';

describe('raySphere', () => {
  it('hits a sphere straight ahead at its near surface', () => {
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, -10, 1)).toBeCloseTo(9);
  });

  it('misses a sphere off to the side or behind', () => {
    expect(raySphere(0, 0, 0, 0, 0, -1, 3, 0, -10, 1)).toBeNull();
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, 10, 1)).toBeNull();
  });

  it('reports 0 when starting inside the sphere', () => {
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, -0.5, 1)).toBe(0);
  });
});

describe('inCone', () => {
  const eye = { x: 0, y: 1.6, z: 0 };
  const look = { x: 0, y: 0, z: -1 };
  it('sees a target straight ahead in range', () => {
    expect(inCone(eye, look, { x: 0, y: 1.6, z: -8 }, 14, 0.35)).toBe(true);
  });
  it('ignores targets outside the angle, beyond range, or behind', () => {
    expect(inCone(eye, look, { x: 6, y: 1.6, z: -6 }, 14, 0.35)).toBe(false);
    expect(inCone(eye, look, { x: 0, y: 1.6, z: -20 }, 14, 0.35)).toBe(false);
    expect(inCone(eye, look, { x: 0, y: 1.6, z: 5 }, 14, 0.35)).toBe(false);
  });
});
```

`zombies/brain.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ATTACK, DAY_TUNING, isAlive, kill, newMind, NIGHT_TUNING, RISE_SECONDS, STUN, takeByFish, think, WAKE, type Senses, type Thought } from './brain';

const out: Thought = { intent: 'stand', hit: false };
const far: Senses = { distance: 50, lit: false, heard: false };
const near: Senses = { distance: 5, lit: false, heard: false };
const touching: Senses = { distance: 1, lit: false, heard: false };

function run(mind = newMind(), senses: Senses, seconds: number, tuning = DAY_TUNING): { mind: typeof mind; hits: number; last: Thought } {
  let hits = 0;
  for (let t = 0; t < seconds; t += 0.05) if (think(mind, senses, tuning, 0.05, out).hit) hits++;
  return { mind, hits, last: { ...out } };
}

describe('zombie brain', () => {
  it('stands still until the player comes close', () => {
    expect(run(undefined, far, 2).last.intent).toBe('stand');
    expect(run(undefined, near, 0.1).mind.state).toBe('chase');
  });

  it('walks by day and runs by night', () => {
    expect(run(undefined, near, 0.2, DAY_TUNING).last.intent).toBe('walk');
    expect(run(undefined, near, 0.2, NIGHT_TUNING).last.intent).toBe('run');
  });

  it('hears noise from any distance', () => {
    expect(run(undefined, { ...far, heard: true }, 0.1).mind.state).toBe('chase');
  });

  it('winds up before landing a blow, then recovers', () => {
    const { mind } = run(undefined, touching, 0.1);
    expect(mind.state).toBe('attack');
    const { hits } = run(mind, touching, ATTACK.windup + 0.1);
    expect(hits).toBe(1);
  });

  it('misses when the player steps away during the windup', () => {
    const { mind } = run(undefined, touching, 0.1);
    expect(run(mind, near, ATTACK.windup + 0.1).hits).toBe(0);
  });

  it('lands about one blow per windup + recover while the player stands still', () => {
    const seconds = 10;
    const expected = seconds / (ATTACK.windup + ATTACK.recover);
    expect(run(undefined, touching, seconds).hits).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
    expect(run(undefined, touching, seconds).hits).toBeLessThanOrEqual(Math.ceil(expected) + 1);
  });

  it('is stunned by a steady flashlight beam, even mid-windup, then resumes the chase', () => {
    const { mind } = run(undefined, touching, 0.1);
    run(mind, { ...touching, lit: true }, STUN.exposure + 0.05);
    expect(mind.state).toBe('stunned');
    expect(run(mind, touching, 0.5).hits).toBe(0);
    run(mind, near, STUN.seconds);
    expect(mind.state).toBe('chase');
  });

  it('forgets flicks of light that are too short to stun', () => {
    const mind = newMind();
    for (let i = 0; i < 10; i++) {
      run(mind, { ...near, lit: true }, STUN.exposure / 2);
      run(mind, near, STUN.exposure);
    }
    expect(mind.state).not.toBe('stunned');
  });

  it('gives up when the player gets far away', () => {
    const { mind } = run(undefined, near, 0.2);
    run(mind, { ...far, distance: DAY_TUNING.giveUp + 1 }, 0.2);
    expect(mind.state).toBe('idle');
  });

  it('dies from a kill and is dead after the fall', () => {
    const mind = newMind();
    kill(mind);
    expect([isAlive(mind), run(mind, touching, 0.1).last.intent]).toEqual([false, 'fall']);
    expect(run(mind, touching, 5).mind.state).toBe('dead');
  });

  it('is dragged away by the fish and cannot be killed twice', () => {
    const mind = newMind();
    takeByFish(mind);
    kill(mind);
    expect(mind.state).toBe('taken');
    expect(run(mind, touching, 0.1).last.intent).toBe('dragged');
  });

  it('lies still until the player comes close, then gets up before chasing', () => {
    const mind = newMind(true);
    expect(run(mind, { ...near, distance: WAKE + 1 }, 1).last.intent).toBe('lie');
    run(mind, { ...near, distance: WAKE - 1 }, 0.05);
    expect(mind.state).toBe('rising');
    expect(run(mind, touching, RISE_SECONDS - 0.2).hits).toBe(0);
    run(mind, touching, 0.3);
    expect(['chase', 'attack']).toContain(mind.state);
  });

  it('can be shot while lying down', () => {
    const mind = newMind(true);
    kill(mind);
    expect(mind.state).toBe('dying');
  });

  it('never hits while dying, taken or dead', () => {
    const mind = newMind();
    kill(mind);
    expect(run(mind, touching, 10).hits).toBe(0);
  });
});
```

`zombies/spawner.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { nextSpawn, SPAWNER } from './spawner';

const strip = { minX: -18, maxX: 2.5, minZ: -415, maxZ: -120 };
const never = (): boolean => false;
function seeded(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('nextSpawn', () => {
  it('waits for the interval', () => {
    const state = { timer: SPAWNER.interval };
    expect(nextSpawn(state, 0.1, 0, { x: 0, z: -150 }, strip, -400, never, seeded())).toBeNull();
  });

  it('spawns in the fog on land, inside the strip', () => {
    const random = seeded(3);
    for (let i = 0; i < 200; i++) {
      const p = nextSpawn({ timer: 0 }, 0.1, 0, { x: 0, z: -200 }, strip, -400, never, random);
      if (!p) continue;
      const d = Math.hypot(p.x, p.z + 200);
      expect(d).toBeGreaterThanOrEqual(SPAWNER.minDistance - 1e-9);
      expect(d).toBeLessThanOrEqual(SPAWNER.maxDistance + 1e-9);
      expect(p.x).toBeGreaterThanOrEqual(strip.minX);
      expect(p.x).toBeLessThanOrEqual(strip.maxX);
      expect(p.z).toBeGreaterThanOrEqual(strip.minZ);
      expect(p.z).toBeLessThanOrEqual(strip.maxZ);
    }
  });

  it('mostly spawns ahead (downstream)', () => {
    const random = seeded(5);
    let ahead = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const p = nextSpawn({ timer: 0 }, 0.1, 0, { x: 0, z: -200 }, strip, -400, never, random);
      if (!p) continue;
      total++;
      if (p.z < -200) ahead++;
    }
    expect(ahead / total).toBeGreaterThan(0.55);
  });

  it('stops at the cap and near the safe spot', () => {
    expect(nextSpawn({ timer: 0 }, 0.1, SPAWNER.cap, { x: 0, z: -200 }, strip, -400, never, seeded())).toBeNull();
    const nearSafe = { x: 0, z: -400 + SPAWNER.quietNearSafe - 1 };
    expect(nextSpawn({ timer: 0 }, 0.1, 0, nearSafe, strip, -400, never, seeded())).toBeNull();
  });

  it('never spawns inside walls', () => {
    const random = seeded(9);
    const blocked = (x: number): boolean => x < -6;
    for (let i = 0; i < 200; i++) {
      const p = nextSpawn({ timer: 0 }, 0.1, 0, { x: 0, z: -200 }, strip, -400, blocked, random);
      if (p) expect(p.x).toBeGreaterThanOrEqual(-6);
    }
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`engine/ray.ts`:
```ts
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function raySphere(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  radius: number,
): number | null {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const inside = lx * lx + ly * ly + lz * lz <= radius * radius;
  if (inside) return 0;
  const along = lx * dx + ly * dy + lz * dz;
  if (along < 0) return null;
  const miss2 = lx * lx + ly * ly + lz * lz - along * along;
  const r2 = radius * radius;
  if (miss2 > r2) return null;
  return along - Math.sqrt(r2 - miss2);
}

export function inCone(eye: Vec3, look: Vec3, target: Vec3, range: number, halfAngle: number): boolean {
  const x = target.x - eye.x;
  const y = target.y - eye.y;
  const z = target.z - eye.z;
  const distance = Math.hypot(x, y, z);
  if (distance > range || distance < 1e-6) return distance < 1e-6;
  return (x * look.x + y * look.y + z * look.z) / distance >= Math.cos(halfAngle);
}
```

`zombies/brain.ts`:
```ts
export type ZombieState = 'idle' | 'chase' | 'attack' | 'recover' | 'stunned' | 'dying' | 'taken' | 'dead';
export type Intent = 'stand' | 'walk' | 'run' | 'strike' | 'stagger' | 'fall' | 'dragged';

export interface Tuning {
  /** Notices the player within this many metres. */
  sight: number;
  /** Chase speed, m/s. Above 2 the zombie runs (player walks 2.2, sprints 4.2). */
  speed: number;
  /** Loses interest beyond this many metres. */
  giveUp: number;
}

/** Tuning knobs. Day: few, slow, half-asleep in the dark. Night: fast, they know where you are. */
export const DAY_TUNING: Tuning = { sight: 7, speed: 1.1, giveUp: 22 };
export const NIGHT_TUNING: Tuning = { sight: 45, speed: 3.5, giveUp: 80 };
export const ATTACK = { range: 1.3, windup: 0.45, recover: 0.9, damage: 34 } as const;
/** Seconds of steady light to stun, and how long the stun lasts. */
export const STUN = { exposure: 0.4, seconds: 2.5 } as const;
export const FALL_SECONDS = 3;
export const TAKEN_SECONDS = 1.6;
export const WAKE = 4;
export const RISE_SECONDS = 1.2;

export interface Mind {
  state: ZombieState;
  timer: number;
  exposure: number;
}

export interface Senses {
  distance: number;
  lit: boolean;
  heard: boolean;
}

export interface Thought {
  intent: Intent;
  hit: boolean;
}

export const newMind = (lying = false): Mind => ({ state: lying ? 'lying' : 'idle', timer: 0, exposure: 0 });

export function isAlive(mind: Mind): boolean {
  return mind.state !== 'dying' && mind.state !== 'taken' && mind.state !== 'dead';
}

export function kill(mind: Mind): void {
  if (!isAlive(mind)) return;
  mind.state = 'dying';
  mind.timer = FALL_SECONDS;
}

export function takeByFish(mind: Mind): void {
  if (!isAlive(mind)) return;
  mind.state = 'taken';
  mind.timer = TAKEN_SECONDS;
}

function set(out: Thought, intent: Intent, hit = false): Thought {
  out.intent = intent;
  out.hit = hit;
  return out;
}

/** Light builds up exposure; anything short of a stun fades away. Returns true when stunned. */
function lightUp(mind: Mind, lit: boolean, dt: number): boolean {
  mind.exposure = lit ? mind.exposure + dt : Math.max(0, mind.exposure - dt);
  if (mind.exposure < STUN.exposure) return false;
  mind.state = 'stunned';
  mind.timer = STUN.seconds;
  mind.exposure = 0;
  return true;
}

function ending(mind: Mind, dt: number, out: Thought): Thought {
  mind.timer -= dt;
  const intent = mind.state === 'taken' ? 'dragged' : 'fall';
  if (mind.timer <= 0) mind.state = 'dead';
  return set(out, intent);
}

export function think(mind: Mind, senses: Senses, tuning: Tuning, dt: number, out: Thought): Thought {
  const move: Intent = tuning.speed > 2 ? 'run' : 'walk';
  switch (mind.state) {
    case 'dead':
      return set(out, 'fall');
    case 'lying':
      if (senses.distance >= WAKE && !senses.heard) return set(out, 'lie');
      mind.state = 'rising';
      mind.timer = RISE_SECONDS;
      return set(out, 'rise');
    case 'rising':
      mind.timer -= dt;
      if (mind.timer <= 0) mind.state = 'chase';
      return set(out, 'rise');
    case 'dying':
    case 'taken':
      return ending(mind, dt, out);
    case 'stunned':
      mind.timer -= dt;
      if (mind.timer <= 0) mind.state = 'chase';
      return set(out, 'stagger');
    case 'idle':
      if (senses.distance < tuning.sight || senses.heard) mind.state = 'chase';
      return set(out, mind.state === 'chase' ? move : 'stand');
    case 'chase':
      if (lightUp(mind, senses.lit, dt)) return set(out, 'stagger');
      if (senses.distance > tuning.giveUp) {
        mind.state = 'idle';
        return set(out, 'stand');
      }
      if (senses.distance <= ATTACK.range) {
        mind.state = 'attack';
        mind.timer = ATTACK.windup;
        return set(out, 'strike');
      }
      return set(out, move);
    case 'attack':
      if (lightUp(mind, senses.lit, dt)) return set(out, 'stagger');
      mind.timer -= dt;
      if (mind.timer > 0) return set(out, 'strike');
      mind.state = 'recover';
      mind.timer = ATTACK.recover;
      return set(out, 'strike', senses.distance <= ATTACK.range * 1.4);
    case 'recover':
      mind.timer -= dt;
      if (mind.timer <= 0) mind.state = 'chase';
      return set(out, 'stand');
  }
}
```
`think` must stay under 50 lines: move the `chase`, `attack` and `lying`/`rising` cases into helpers (`chase(mind, senses, tuning, dt, out)`, `windup(...)`, `wake(...)`) that each return the `Thought`.

`zombies/spawner.ts`:
```ts
/** Tuning knobs for night spawns. */
export const SPAWNER = {
  /** Seconds between spawns. */
  interval: 2.2,
  /** Most zombies alive at once (also the pool size). */
  cap: 14,
  /** Spawn ring: inside the night fog (far 55) but out of the flashlight (22). */
  minDistance: 26,
  maxDistance: 40,
  /** Share of spawns placed downstream, ahead of the player. */
  ahead: 0.7,
  /** No new zombies this close to the safe spot, so arriving feels safe. */
  quietNearSafe: 35,
} as const;

export interface Strip { minX: number; maxX: number; minZ: number; maxZ: number }
export interface SpawnPoint { x: number; z: number }

const TRIES = 6;

function candidate(player: { x: number; z: number }, strip: Strip, random: () => number): SpawnPoint {
  const distance = SPAWNER.minDistance + random() * (SPAWNER.maxDistance - SPAWNER.minDistance);
  const x = strip.minX + random() * (strip.maxX - strip.minX);
  const dx = x - player.x;
  const along = Math.sqrt(Math.max(0, distance * distance - dx * dx));
  const sign = random() < SPAWNER.ahead ? -1 : 1;
  return { x, z: player.z + sign * along };
}

export function nextSpawn(
  state: { timer: number },
  dt: number,
  alive: number,
  player: { x: number; z: number },
  strip: Strip,
  safeZ: number,
  blocked: (x: number, z: number) => boolean,
  random: () => number,
): SpawnPoint | null {
  state.timer -= dt;
  if (state.timer > 0 || alive >= SPAWNER.cap) return null;
  if (player.z - safeZ < SPAWNER.quietNearSafe) return null;
  state.timer = SPAWNER.interval;
  for (let i = 0; i < TRIES; i++) {
    const p = candidate(player, strip, random);
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    const inStrip = p.z >= strip.minZ && p.z <= strip.maxZ;
    if (inStrip && d >= SPAWNER.minDistance - 1e-9 && d <= SPAWNER.maxDistance + 1e-9 && !blocked(p.x, p.z)) return p;
  }
  return null;
}
```
(`candidate` can produce `d < minDistance` when the strip is narrower than the ring — the retry loop and the distance check handle it.)

- [ ] **Step 4: Run** `pnpm vitest run` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): ray math, zombie brain, night spawner"`

---
### Task 11: Sounds — files, procedural effects, the horde layer

**Files:**
- Create: `src/dreams/follow-the-river/sounds.ts`, `sounds.test.ts`

**Interfaces:**
- Consumes: `AudioBus.load`, `assetUrl`, `stingSamples` (engine/scare.ts).
- Produces:
  ```ts
  export interface Sounds {
    groans: AudioBuffer[];          // 24 single zombie groans/snarls
    water: AudioBuffer; wind: AudioBuffer; night: AudioBuffer[]; weird: AudioBuffer[]; alarm: AudioBuffer;
    horde: AudioBuffer;             // 8 s loop: many distant groans mixed (the "group" sound)
    twang: AudioBuffer; thud: AudioBuffer; splash: AudioBuffer; sting: AudioBuffer;
    heartbeat: AudioBuffer; tapeVoice: AudioBuffer; click: AudioBuffer;
  }
  export async function loadSounds(audio: AudioBus): Promise<Sounds>;
  // Pure generators (values in −1..1, deterministic with an injected random):
  export function pluckSamples(rate: number, frequency: number, seconds: number, random: () => number): Float32Array<ArrayBuffer>;
  export function splashSamples(rate: number, seconds: number, random: () => number): Float32Array<ArrayBuffer>;
  export function thudSamples(rate: number): Float32Array<ArrayBuffer>;
  export function heartbeatSamples(rate: number): Float32Array<ArrayBuffer>;
  /** Mom on a worn tape: muffled syllable bursts (band-passed noise at ~4 Hz), hiss and wow. */
  export function tapeVoiceSamples(rate: number, seconds: number, random: () => number): Float32Array<ArrayBuffer>;
  /** Overlaps `count` groans at random offsets and gains, low-passed, normalised to a 0.8 peak. */
  export function mixHorde(rate: number, groans: readonly Float32Array[], seconds: number, count: number, random: () => number): Float32Array<ArrayBuffer>;
  ```

- [ ] **Step 1: Write the failing test** — `sounds.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { heartbeatSamples, mixHorde, pluckSamples, splashSamples, tapeVoiceSamples, thudSamples } from './sounds';

function seeded(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const RATE = 8000;

describe('procedural sounds', () => {
  it.each([
    ['pluck', () => pluckSamples(RATE, 110, 0.6, seeded())],
    ['splash', () => splashSamples(RATE, 0.8, seeded())],
    ['thud', () => thudSamples(RATE)],
    ['heartbeat', () => heartbeatSamples(RATE)],
    ['tape voice', () => tapeVoiceSamples(RATE, 2, seeded())],
  ])('%s stays in range and is not silent', (_, make) => {
    const samples = make();
    expect(samples.length).toBeGreaterThan(RATE * 0.1);
    expect(peak(samples)).toBeLessThanOrEqual(1);
    expect(peak(samples)).toBeGreaterThan(0.05);
  });

  it('is repeatable with the same random source', () => {
    expect(splashSamples(RATE, 0.3, seeded(4))).toEqual(splashSamples(RATE, 0.3, seeded(4)));
  });

  it('plucks fade out (a bow string, not a drone)', () => {
    const s = pluckSamples(RATE, 110, 1, seeded());
    expect(peak(s.subarray(s.length - RATE / 10))).toBeLessThan(peak(s.subarray(0, RATE / 10)) / 4);
  });
});

describe('mixHorde', () => {
  it('layers many groans into a loop of the requested length with a safe peak', () => {
    const groan = new Float32Array(RATE).map((_, i) => Math.sin(i / 10));
    const mix = mixHorde(RATE, [groan, groan], 4, 12, seeded());
    expect(mix.length).toBe(RATE * 4);
    expect(peak(mix)).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(peak(mix)).toBeGreaterThan(0.5);
  });

  it('returns silence when there are no groans', () => {
    expect(peak(mixHorde(RATE, [], 1, 5, seeded()))).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module missing).

- [ ] **Step 3: Implement.** Generators follow `stingSamples`' style (one `Float32Array`, a loop, `Math.max(-1, Math.min(1, v))`):
  - `pluckSamples`: Karplus–Strong — a delay line of `round(rate/frequency)` filled with noise, each output = average of the two oldest × 0.996; multiply by an exponential fade.
  - `splashSamples`: white noise through a one-pole low-pass whose cutoff falls over time, envelope `exp(-t·5)` with a short 30 ms attack.
  - `thudSamples`: 60 ms of a 70 Hz sine with `exp(-t·40)` plus a 5 ms noise click.
  - `heartbeatSamples`: two 50 Hz thumps (`lub-dub`, 0.18 s apart) in a 0.9 s buffer (looped while hurt).
  - `tapeVoiceSamples`: noise band-passed by two one-pole filters (≈300–1200 Hz), amplitude = `max(0, sin(2π·3.7·t + 2·sin(2π·0.7·t)))^2` (syllables), plus hiss (noise × 0.04) and wow (slow amplitude wobble 0.9–1.0). The pages are the words; this is only the sound of a voice.
  - `mixHorde`: sum `count` groans (each at a random offset, wrapping so the loop is seamless, gain 0.3–0.7), one-pole low-pass (distance), then scale so the peak is 0.8.
  - `loadSounds`: `Promise.all` of `audio.load(assetUrl('sounds/…m4a'))` for the files listed in Task 5, then builds the procedural buffers with `listener.context.createBuffer` (`horde` from the decoded groans' first channel). Keep the file list as one `const` object.

- [ ] **Step 4: Run** `pnpm vitest run` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): sounds — files, procedural effects, horde layer"`

---

### Task 12: The horde — zombies in the world

**Files:**
- Create: `src/dreams/follow-the-river/zombies/look.ts`, `look.test.ts`, `zombies/steer.ts`, `steer.test.ts`, `zombies/horde.ts`
- Modify: `src/engine/models.ts` (add `loadSkinned`)

**Interfaces:**
- Consumes: brain (Task 10), `raySphere`/`inCone` (Task 10), `BoxGrid` (Task 2), `AudioBus.positional` (Task 4), `Sounds.groans` (Task 11), `characterUrl` (Task 8).
- Produces:
  ```ts
  // engine/models.ts
  export interface SkinnedAsset { scene: THREE.Object3D; clips: readonly THREE.AnimationClip[] }
  /** Loads a skinned GLB once (marked cached); clone `scene` with SkeletonUtils.clone per character. */
  export async function loadSkinned(url: string): Promise<SkinnedAsset>;
  // zombies/look.ts
  export const OUTFITS: { readonly m: readonly string[]; readonly f: readonly string[] };
  /** Outfit for the i-th zombie: every outfit appears before any repeats; about 4 in 10 are women. */
  export function pickOutfit(i: number): { body: 'm' | 'f'; outfit: string };
  export const CLIP_FOR: Readonly<Record<Intent, string>>;   // lie→Death(held at its end), rise→GetUp, stand→Idle, walk→Walk, run→Run, strike→Attack, stagger→Hit, fall→Death, dragged→Hit
  export const LOOPING: ReadonlySet<string>;                  // Idle, Walk, Run
  /** Metres per second the feet travel at timeScale 1. Tuning knobs, set by eye in the browser. */
  export const CLIP_SPEED: Readonly<{ Walk: number; Run: number }>;
  export function timeScaleFor(clip: string, speed: number): number;
  // zombies/steer.ts
  /** Unit direction toward `target`, pushed away from neighbours closer than SEPARATION (xz pairs). Writes `out`. */
  export function steer(x: number, z: number, tx: number, tz: number, neighbours: Float32Array, count: number, out: { x: number; z: number }): void;
  export const SEPARATION: number; // 1.1 m
  // zombies/horde.ts
  export interface PlayerSense { x: number; z: number; eye: Vec3; look: Vec3; beamOn: boolean; beamRange: number; beamHalfAngle: number }
  export interface Horde {
    /** Places a zombie from the pool (a never-used or long-dead slot). Returns its id, or −1 when full. */
    spawn(x: number, z: number, yaw: number, tuning: Tuning, lying?: boolean): number;
    update(dt: number, player: PlayerSense, onHit: (damage: number) => void): void;
    rayHit(origin: Vec3, dir: Vec3, maxDistance: number): { id: number; distance: number } | null;
    kill(id: number): void;
    takeByFish(id: number): void;
    alert(x: number, z: number, radius: number): void;
    /** Alive zombies (not dying, taken or dead). */
    forEachAlive(fn: (id: number, x: number, z: number) => void): void;
    aliveCount(): number;
    reset(): void;
    dispose(): void;
  }
  export async function createHorde(scene: THREE.Scene, audio: AudioBus, grid: BoxGrid, groans: readonly AudioBuffer[], capacity: number): Promise<Horde>;
  ```

- [ ] **Step 1: Write the failing tests**

`look.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CLIP_FOR, OUTFITS, pickOutfit, timeScaleFor } from './look';

describe('zombie looks', () => {
  it('uses every outfit before repeating one', () => {
    const total = OUTFITS.m.length + OUTFITS.f.length;
    const seen = new Set(Array.from({ length: total }, (_, i) => JSON.stringify(pickOutfit(i))));
    expect(seen.size).toBe(total);
  });

  it('only names real outfits', () => {
    for (let i = 0; i < 40; i++) {
      const { body, outfit } = pickOutfit(i);
      expect(OUTFITS[body]).toContain(outfit);
    }
  });

  it('maps every intent to a clip that exists in the zombie files', () => {
    const clips = ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death', 'GetUp'];
    for (const clip of Object.values(CLIP_FOR)) expect(clips).toContain(clip);
  });

  it('speeds the walk clip up with the zombie so feet do not slide', () => {
    expect(timeScaleFor('Walk', 1.8)).toBeCloseTo(2 * timeScaleFor('Walk', 0.9));
    expect(timeScaleFor('Idle', 3)).toBe(1);
  });
});
```

`steer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SEPARATION, steer } from './steer';

describe('steer', () => {
  const out = { x: 0, z: 0 };
  it('heads straight for the target with no neighbours', () => {
    steer(0, 0, 0, -10, new Float32Array(0), 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
  });

  it('is pushed sideways by a neighbour that is too close', () => {
    steer(0, 0, 0, -10, new Float32Array([-SEPARATION / 2, 0]), 1, out);
    expect(out.x).toBeGreaterThan(0.1);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1);
  });

  it('ignores neighbours that are far enough away, and itself', () => {
    steer(0, 0, 0, -10, new Float32Array([5, 5, 0, 0]), 2, out);
    expect(out.x).toBeCloseTo(0);
  });

  it('stands still when already on the target', () => {
    steer(1, 1, 1, 1, new Float32Array(0), 0, out);
    expect([out.x, out.z]).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`look.ts`: `OUTFITS = { m: ['beach','casual','farmer','hoodie','punk','suit','swat','worker'], f: ['casual','punk','soldier','suit','worker'] }`. `pickOutfit(i)`: interleave into one fixed list `[m0, f0, m1, f1, m2, m3, f2, …]` (13 entries, 5 women) and return `list[i % list.length]`. `CLIP_SPEED = { Walk: 0.9, Run: 4.5 }`; `timeScaleFor` = `speed / CLIP_SPEED[clip]` for Walk/Run, else 1.

`steer.ts`: direction to target (0,0 if closer than 1e-6), plus for each neighbour within `SEPARATION` (skip distance < 1e-6 = itself) add `(self − other)/d × (SEPARATION − d)/SEPARATION × 1.5`, normalise.

`loadSkinned`: like `loadModel` but returns `{ scene, clips: gltf.animations }`, runs `enableShadows(scene, false)` and `markCached`; no `makeLit` (these are lit materials).

`horde.ts` (keep each function < 50 lines; split into `createBody`, `animate`, `move`, `voice` helpers in the same file, under 500 lines):
- Load both zombie GLBs with `loadSkinned(characterUrl('zombie-m'|'zombie-f'))`. Build `capacity` bodies up front: `clone(asset.scene)` (`SkeletonUtils.clone`), remove every outfit mesh except `pickOutfit(i).outfit`, set `frustumCulled = false` on the kept mesh (skinned bounds are wrong once animated), park it at y = −50, add to the scene. One `AnimationMixer` per body with one action per clip.
- Per body state (plain arrays/objects reused every frame, no allocation in `update`): position, yaw, `Mind`, `Tuning`, current clip, `Thought`.
- `update(dt, player, onHit)`: for each active body — senses (`distance` on xz; `lit` = `player.beamOn && inCone(player.eye, player.look, chest, range, halfAngle)`; `heard` = alerted this frame); `think`; on `hit` call `onHit(ATTACK.damage)`; move when the intent is walk/run: `steer` toward the player using a reused `Float32Array` of neighbour positions, speed = `tuning.speed`, then `resolveCircle(x, z, 0.35, grid.near(x, z, 1))`; face the movement direction with a smoothed yaw (turn rate 6 rad/s); when `dragged`, slide toward +x (the river) at 2 m/s and sink at 1.2 m/s; play the intent's clip with `fadeIn/fadeOut(0.25)` cross-fades (`LoopOnce` + `clampWhenFinished` for Death/GetUp/Hit/Attack; `lie` = Death clip with `time = duration`, paused); set walk/run `timeScale` via `timeScaleFor`; `mixer.update(dt)`.
- Bodies that finish `taken` are parked; `dead` bodies stay on the ground as corpses until their slot is reused (oldest first) or `reset()`.
- Shadows: every 0.5 s, the 4 nearest alive zombies within 15 m get `castShadow = true`, all others false (only casters change, never materials).
- Voices: 4 `audio.positional(body, 3)` voices. Every 1.2–3.5 s a random alive zombie within 25 m that has no voice groans (random `groans` buffer, volume 0.8); a zombie starting a windup always snarls (volume 1); a dying zombie gives one last groan.
- `rayHit`: `raySphere` against each alive body's head (y 1.6, r 0.2) and chest (y 1.15, r 0.38); a lying body is one sphere (y 0.25, r 0.5). Nearest hit within `maxDistance`.
- `alert(x, z, r)`: marks alive zombies within `r` as `heard` for the next update.
- `dispose()`: stop voices, remove bodies, `mixer.stopAllAction()`; geometry is cached (not freed).

- [ ] **Step 4: Verify** — `pnpm vitest run` PASS; `pnpm run check`. Browser check is in Task 16 (the horde has no scene of its own until then).
- [ ] **Step 5: Commit** — `git commit -m "feat(river): zombie horde — outfits, steering, cross-faded animation, voices, hits"`

---

### Task 13: Flashlight battery and the bow

**Files:**
- Modify: `src/dreams/follow-the-river/flashlight.ts`, `src/engine/collide.ts`
- Create: `flashlight.test.ts`, `src/dreams/follow-the-river/bow.ts`, `bow.test.ts`, extend `src/engine/collide.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // flashlight.ts
  export const BATTERY: { drainPerSecond: number; low: number };   // 0.9 %/s, flicker below 20 %
  export const BEAM: { range: number; halfAngle: number };          // stun cone: 14 m, 0.3 rad (narrower than the light)
  export function drainBattery(battery: number, on: boolean, dt: number): number;
  /** 0..1: full above BATTERY.low, stuttering below it, 0 when empty. Deterministic in `time`. */
  export function beamLevel(battery: number, time: number): number;
  export interface Flashlight { readonly light: THREE.SpotLight; on: boolean; /** Sets intensity from on + battery (never `visible`). */ apply(battery: number, time: number): void; dispose(): void }
  export function createFlashlight(camera: THREE.Camera): Flashlight;
  // collide.ts
  /** Fraction 0..1 along the segment where it first enters the box, or null. */
  export function segmentHitsBox(x0: number, z0: number, x1: number, z1: number, box: Box): number | null;
  // bow.ts
  export const BOW: { speed: number; gravity: number; cooldown: number; life: number; pool: number }; // 45 m/s, 4.9, 0.9 s, 3 s, 8
  export interface Arrow { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; state: 'idle' | 'flying' | 'stuck' }
  export function stepArrow(arrow: Arrow, dt: number): void;
  export interface Bow {
    readonly ready: boolean;
    /** Looses an arrow from `eye` along unit `look`. Caller has already spent the arrow. */
    fire(eye: Vec3, look: Vec3): void;
    /** Flies arrows, kills what they hit, sticks misses into walls/ground; returns arrows recovered this frame. */
    update(dt: number, horde: Horde, grid: BoxGrid, player: { x: number; z: number }): number;
    reset(): void;
    dispose(): void;
  }
  export async function createBow(camera: THREE.Camera, scene: THREE.Scene, audio: AudioBus, sounds: Sounds): Promise<Bow>;
  ```

- [ ] **Step 1: Write the failing tests**

`flashlight.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BATTERY, beamLevel, drainBattery } from './flashlight';

describe('battery', () => {
  it('drains only while on and never below zero', () => {
    expect(drainBattery(50, false, 10)).toBe(50);
    expect(drainBattery(50, true, 10)).toBeCloseTo(50 - 10 * BATTERY.drainPerSecond);
    expect(drainBattery(1, true, 100)).toBe(0);
  });

  it('shines fully above the low mark and not at all when empty', () => {
    expect(beamLevel(80, 3.3)).toBe(1);
    expect(beamLevel(0, 3.3)).toBe(0);
  });

  it('stutters when low: sometimes dimmed, never above full', () => {
    const levels = Array.from({ length: 200 }, (_, i) => beamLevel(BATTERY.low / 2, i * 0.05));
    expect(Math.min(...levels)).toBeLessThan(0.6);
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
  });
});
```

`bow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BOW, stepArrow, type Arrow } from './bow';

const arrow = (): Arrow => ({ x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -BOW.speed, age: 0, state: 'flying' });

describe('stepArrow', () => {
  it('flies forward and drops under gravity', () => {
    const a = arrow();
    stepArrow(a, 0.1);
    expect(a.z).toBeCloseTo(-BOW.speed * 0.1);
    expect(a.vy).toBeLessThan(0);
  });

  it('is gone (idle) after its life', () => {
    const a = arrow();
    for (let i = 0; i < 40; i++) stepArrow(a, 0.1);
    expect(a.state).toBe('idle');
  });

  it('does not move once stuck', () => {
    const a = { ...arrow(), state: 'stuck' as const };
    stepArrow(a, 1);
    expect([a.x, a.y, a.z]).toEqual([0, 1.5, 0]);
  });
});
```

Append to `collide.test.ts`:
```ts
describe('segmentHitsBox', () => {
  const box = boxAt(0, -5, 2, 2);
  it('finds where a segment enters a box', () => {
    expect(segmentHitsBox(0, 0, 0, -10, box)).toBeCloseTo(0.4);
  });
  it('misses boxes off to the side and segments that stop short', () => {
    expect(segmentHitsBox(5, 0, 5, -10, box)).toBeNull();
    expect(segmentHitsBox(0, 0, 0, -3, box)).toBeNull();
  });
  it('reports 0 when the segment starts inside', () => {
    expect(segmentHitsBox(0, -5, 0, -6, box)).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**
- `drainBattery`: `on ? Math.max(0, battery − drainPerSecond·dt) : battery`.
- `beamLevel`: `battery <= 0 → 0`; `battery >= low → 1`; else `0.35 + 0.65·step` where `step` is 0 or 1 from `Math.sin(time·23) + Math.sin(time·7.3) > 0.4` (stutter), scaled by `battery / low` floor 0.4.
- `createFlashlight` keeps Plan 1's spotlight (shadow-casting, intensity 80) but toggles by intensity: `apply(battery, time)` sets `light.intensity = on ? FLASHLIGHT.intensity · beamLevel(battery, time) : 0`. Never touch `visible`.
- `segmentHitsBox`: slab method on x and z.
- `stepArrow`: if not flying, return; integrate; `vy −= gravity·dt`; `age += dt`; past `life` → `idle`.
- `createBow`: viewmodel `props/bow.glb` added to the camera at (0.28, −0.3, −0.55), rotated so the limbs are vertical and slightly canted; a nocked `arrow.glb` shows only when `ready`. `fire`: take an idle arrow from the pool (8 meshes cloned from `arrow.glb`, parked when idle), place it at the eye + 0.3·look, velocity `look·speed`, play `twang`, kick the viewmodel back 6 cm and ease it home over 0.25 s, start the cooldown. `update`: for each flying arrow, step it, then test the segment it just travelled — `horde.rayHit` (kill → `thud`, the arrow drops as a stuck arrow at the zombie's feet), walls (`segmentHitsBox` against `grid.near`, below 3 m → stuck at the hit point), ground (y ≤ 0.02 → stuck, tilted into the ground). Orient flying arrows along their velocity. Stuck arrows within 1.1 m of the player are recovered automatically (`click`, count returned). `reset` parks all arrows.

- [ ] **Step 4: Run** `pnpm vitest run` — PASS; `pnpm run check`.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): flashlight battery and the silent bow"`

---

### Task 14: The orca — guardian of the river

**Files:**
- Create: `src/dreams/follow-the-river/fish.ts`, `fish.test.ts`

**Interfaces:**
- Consumes: `Horde.forEachAlive/takeByFish`, `EDGE_X`, `RIVER_X`, `characterUrl('orca')`, `Sounds.splash`, `AudioBus`.
- Produces:
  ```ts
  export const FISH: { strikesPerPack: number; baseStrikes: number; reach: number; cooldown: number; follow: number };
  // strikesPerPack 3, baseStrikes 2 (Mom's pack), reach 3.5 m from the water's edge, cooldown 1.4 s, follow 2.5 m/s lag speed
  export function strikesFor(fed: number): number;
  /** The zombie to take: alive, within `reach` of the edge, nearest to the player. */
  export function pickStrike(candidates: ArrayLike<number> /* id,x,z triples */, count: number, player: { x: number; z: number }, edgeX: number): number | null;
  export function canThrow(x: number, edgeX: number, fishPacks: number): boolean; // within 1.5 m of the edge and holding a pack
  export interface Fish {
    /** Night: strikes left this phase. */
    readonly strikes: number;
    arm(strikes: number): void;
    /** Throw a pack: arc into the water, splash, the orca surfaces once to take it. */
    feed(from: Vec3): void;
    /** Swims alongside the player (fin just breaking the surface); strikes zombies at night. */
    update(dt: number, player: { x: number; z: number }, horde: Horde | null, night: boolean): void;
    reset(): void;
    dispose(): void;
  }
  export async function createFish(scene: THREE.Scene, audio: AudioBus, sounds: Sounds): Promise<Fish>;
  ```

- [ ] **Step 1: Write the failing test** — `fish.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { canThrow, FISH, pickStrike, strikesFor } from './fish';

describe('fish', () => {
  it('gets stronger with every pack thrown in by day', () => {
    expect(strikesFor(0)).toBe(FISH.baseStrikes);
    expect(strikesFor(2)).toBe(FISH.baseStrikes + 2 * FISH.strikesPerPack);
  });

  it('only takes zombies near the water, nearest to the player first', () => {
    const edge = 3;
    // id, x, z
    const c = new Float32Array([1, -10, 0, 2, 2, -8, 3, 1.5, -2]);
    expect(pickStrike(c, 3, { x: 0, z: 0 }, edge)).toBe(3);
    expect(pickStrike(new Float32Array([1, -10, 0]), 1, { x: 0, z: 0 }, edge)).toBeNull();
  });

  it('lets you throw only from the edge and only with a pack', () => {
    expect(canThrow(2, 3, 1)).toBe(true);
    expect(canThrow(-2, 3, 1)).toBe(false);
    expect(canThrow(2, 3, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**
- Pure helpers as specified (`reach` measured as `edgeX − x <= FISH.reach`).
- `createFish`: load `orca.glb` with `loadSkinned`, clone, `Swim` loop always playing, `frustumCulled = false`. Cruising: the orca's centre sits at y −1.1 so only the dorsal fin breaks the (opaque) water; its z eases toward `player.z − 4` at `follow` speed, x weaves around `RIVER_X − 2` (`sin(time·0.4)·1.5`); heading follows its motion. A dark, soft-edged ellipse decal (8 × 3 m, `MeshBasicMaterial`, black, opacity 0.35, `depthWrite: false`) at y −0.13 above the water under the orca reads as its shadow.
- Strike (night, `strikes > 0`, cooldown over, `pickStrike` finds one): move the orca to the zombie (x clamped to the edge + 1), play `Lunge` (cross-fade), raise it to y +0.4 then back under over 1 s, `horde.takeByFish(id)`, `splash` at the spot (positional, volume 1), decrement strikes. While striking it does not follow.
- `feed(from)`: a `fishpack.glb` clone flies a 1 s parabola from the player's hand into the water 4 m out, `splash`, then a slow surface rise of the orca beside it (a reassuring, not scary, moment).
- Pause-safety: everything advances only through `update(dt)`.

- [ ] **Step 4: Run** `pnpm vitest run` — PASS; `pnpm run check`.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): the orca guardian — follows, feeds, strikes"`

---

### Task 15: HUD and pickups

**Files:**
- Create: `src/dreams/follow-the-river/hud.ts`, `hud.test.ts`, `pickups.ts`, `pickups.test.ts`
- Modify: `src/style.css` (HUD styles)

**Interfaces:**
- Consumes: `RunState`, `Supplies`, `addSupply` (Task 7), `PickupDef`, `PickupKind` (Task 8), `propUrl`.
- Produces:
  ```ts
  // hud.ts
  export interface HudState { battery: number; arrows: number; fishPacks: number; ammo: number; health: number; showAmmo: boolean }
  export interface Hud { set(state: HudState): void; prompt(text: string | null): void; hurt(): void; show(visible: boolean): void; dispose(): void }
  export function createHud(root: HTMLElement): Hud;
  /** Five-cell battery meter, e.g. "▮▮▮▯▯". */
  export function batteryCells(battery: number): string;
  // pickups.ts
  export const PICKUP_RADIUS: number; // 1.4 m
  export const PICKUP_GAIN: Readonly<Record<PickupKind, { kind: SupplyKind; amount: number } | null>>;
  // battery → +45 battery, arrows → +3, fishPack → +1, ammo → +6, tape → null (it's a story item)
  export function nearestPickup(x: number, z: number, list: readonly PickupDef[], taken: ReadonlySet<string>): PickupDef | null;
  export function collect(state: RunState, pickup: PickupDef): RunState;
  export function promptFor(pickup: PickupDef, supplies: Supplies): string;
  export interface PickupMeshes { place(list: readonly PickupDef[], taken: ReadonlySet<string>): void; remove(id: string): void; update(dt: number): void; dispose(): void }
  export async function createPickupMeshes(scene: THREE.Scene): Promise<PickupMeshes>;
  ```

- [ ] **Step 1: Write the failing tests**

`hud.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { batteryCells } from './hud';

describe('batteryCells', () => {
  it('shows five cells, rounding up so a nearly-empty battery still shows one', () => {
    expect(batteryCells(100)).toBe('▮▮▮▮▮');
    expect(batteryCells(41)).toBe('▮▮▮▯▯');
    expect(batteryCells(1)).toBe('▮▯▯▯▯');
    expect(batteryCells(0)).toBe('▯▯▯▯▯');
  });
});
```

`pickups.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { freshRun, restartPhase, SUPPLY_LIMITS } from './state';
import { collect, nearestPickup, PICKUP_RADIUS, promptFor } from './pickups';
import type { PickupDef } from './areas/types';

const battery: PickupDef = { id: 'battery-1', kind: 'battery', x: 0, z: 0 };
const tape: PickupDef = { id: 'tape-1', kind: 'tape', x: 3, z: 0, tape: 1 };

describe('pickups', () => {
  it('finds the nearest untaken pickup within reach', () => {
    expect(nearestPickup(0.5, 0, [battery, tape], new Set())).toBe(battery);
    expect(nearestPickup(0.5, 0, [battery, tape], new Set(['battery-1']))).toBeNull();
    expect(nearestPickup(PICKUP_RADIUS + 0.1, 0, [battery], new Set())).toBeNull();
  });

  it('adds supplies, marks the pickup taken, and does not mutate', () => {
    const live = restartPhase(freshRun());
    const after = collect(live, battery);
    expect(after.taken).toContain('battery-1');
    expect(live.taken).not.toContain('battery-1');
  });

  it('files tapes as found', () => {
    expect(collect(restartPhase(freshRun()), tape).tapes).toEqual([1]);
  });

  it('says when you cannot carry more', () => {
    const full = { ...freshRun().supplies, battery: SUPPLY_LIMITS.battery };
    expect(promptFor(battery, full)).toMatch(/full/i);
    expect(promptFor(battery, { ...full, battery: 10 })).toMatch(/^E: /);
  });
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
- HUD: a `div.hud` appended to the overlay root, `pointer-events: none`: bottom-left stats (`🔦 ▮▮▮▯▯`, `➶ 6`, `🐟 1`, ammo hidden unless `showAmmo`), a small centre crosshair dot, a bottom-centre prompt line, a full-screen red vignette `div.hurt` whose opacity follows `1 − health/100` and flashes on `hurt()` (CSS transition). Large text (1.2rem+), `textContent` only, and only write the DOM when a value changed (compare to the last state).
- Pickups: one mesh per pickup from `props/{battery,arrows,fishpack,tape}.glb` (`loadModel`), bobbing 4 cm and turning slowly; the emissive markers from Task 6 make them findable in the dark. `promptFor`: `"E: pick up batteries"`, `"E: pick up arrows"`, `"E: pick up a fish pack"`, `"E: take the tape"`, or `"Batteries full"` etc. when that supply is at its limit (tape always collectable).

- [ ] **Step 4: Run** `pnpm vitest run` — PASS; `pnpm run check`.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): HUD and pickups"`

---
### Task 16: The chapter — day, wait for dark, night, safe spot, death, saves, hints

**Files:**
- Create: `src/dreams/follow-the-river/flow.ts`, `flow.test.ts`, `chapter.ts`, `play.ts`, `hints.ts`
- Modify: `src/dreams/types.ts` (add optional `begin?(): void` to `DreamModule`), `src/session.ts` (call `dream.begin?.()` when `info.intro` pages finish), `src/dreams/follow-the-river/index.ts` (rewrite: phase controller), `src/dreams/registry.ts` (intro/how-to-play text, see Step 3)
- Delete: the Plan 1 test-dream code paths in `index.ts` (the watcher moves to Task 17)

**Interfaces:**
- Consumes: everything from Tasks 7–15.
- Produces:
  ```ts
  // flow.ts (pure)
  export const MAX_HEALTH = 100;
  export function takeDamage(health: number, damage: number): number;     // clamps at 0
  export function atSafeSpot(z: number, safeZ: number): boolean;          // z <= safeZ + 3
  export function nearSpot(x: number, z: number, spot: { x: number; z: number }, radius: number): boolean;
  export function phaseTitle(phase: Phase): string;                        // 'Day 1', 'Night 1', … ('' for intro/end)
  /** Where the player stands when `phase` (re)starts in `area`. */
  export function spawnFor(phase: Phase, area: AreaDef): Spot;
  // hints.ts
  export type HintId = 'pickup' | 'shack' | 'bow' | 'fish' | 'wait' | 'night' | 'hurt' | 'tape';
  export const HINTS: Readonly<Record<HintId, readonly string[]>>;
  // chapter.ts
  export interface Chapter { dispose(): void }
  /** Builds the area once and runs its day and night. Calls `onDone(save)` after the night is survived. */
  export async function startChapter(ctx: DreamContext, area: AreaDef, save: RunSave, store: SaveStore<RunSave>, onDone: (save: RunSave) => void): Promise<Chapter>;
  ```

- [ ] **Step 1: Write the failing test** — `flow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CITY } from './areas/city';
import { atSafeSpot, MAX_HEALTH, nearSpot, phaseTitle, spawnFor, takeDamage } from './flow';

describe('chapter flow', () => {
  it('takes damage down to zero, never below', () => {
    expect(takeDamage(MAX_HEALTH, 34)).toBe(66);
    expect(takeDamage(10, 34)).toBe(0);
  });

  it('knows when the night is survived', () => {
    expect(atSafeSpot(CITY.safeZ - 1, CITY.safeZ)).toBe(true);
    expect(atSafeSpot(CITY.safeZ + 10, CITY.safeZ)).toBe(false);
  });

  it('spawns days at the day spawn and nights past the barricade', () => {
    expect(spawnFor('day1', CITY)).toEqual(CITY.daySpawn);
    expect(spawnFor('night1', CITY)).toEqual(CITY.nightStart);
  });

  it('titles phases for the title cards', () => {
    expect([phaseTitle('day1'), phaseTitle('night3'), phaseTitle('intro')]).toEqual(['Day 1', 'Night 3', '']);
  });

  it('checks closeness on the ground plane', () => {
    expect(nearSpot(1, 1, { x: 0, z: 0 }, 2)).toBe(true);
    expect(nearSpot(3, 0, { x: 0, z: 0 }, 2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`hints.ts` — exact text (player-paced pages via `ctx.read`; each shown once per run, ids kept in `RunState.hints`):
```ts
export const HINTS = {
  pickup: ['Things you can use glow faintly in the dark: batteries, arrows, fish packs.', 'Walk up to one and press E to pick it up.'],
  shack: ['It is pitch black in here.', 'Press F for your flashlight. It eats battery — watch the meter in the corner.'],
  bow: ['Click to shoot your bow. It is silent.', 'Walk over your arrows to pick them back up.'],
  fish: ['Stand at the water\'s edge and press E to throw a fish pack in.', 'Every pack you feed it by day makes it hunt harder for you at night.'],
  wait: ['When you are ready, rest by the campfire and wait for dark.', 'You cannot come back here after.'],
  night: ['Night. They are fast now.', 'Run downstream to the boathouse. Shine your flashlight in their faces to stop them for a moment.', 'Stay close to the water. Something in the river is hunting them too.'],
  hurt: ['You are hurt. Three hits and you are dead.'],
  tape: ['A video tape. Mom\'s handwriting on the label.'],
} as const satisfies Record<HintId, readonly string[]>;
```

`registry.ts` — intro pages and how-to-play (exact):
```ts
intro: [
  'Follow the river. Survive 3 nights.',
  'Move with W A S D. Look around with the mouse. Hold Shift to run.',
  'Press E to use things. Press F for your flashlight.',
  'Press Esc any time to pause. The pause menu has every rule.',
],
howToPlay: [
  'W A S D: move. Mouse: look. Shift: run. E: use / pick up. F: flashlight. Click: shoot the bow.',
  'By day: search the area for batteries, arrows and fish packs. Zombies are slow, and hide in the dark.',
  'Throw fish packs into the river (E at the water\'s edge). The more you feed it, the more it protects you at night.',
  'Rest by the campfire to wait for dark. You cannot go back.',
  'By night: run downstream to the safe spot. Zombies are fast. Your flashlight stuns them; it uses battery.',
  'The bow is silent. Walk over arrows to pick them up again.',
  'Three hits and you die. Dying restarts the day or night with what you had when it began.',
],
```

`index.ts` (phase controller, < 150 lines): `createDream()` returns `{ start, begin, dispose }`.
- `start(ctx)`: `store = createSaveStore(browserStorage(), 'follow-the-river', isRunSave)`; `save = store.load() ?? freshRun()`; dev only: `?phase=night1` etc. overrides `save.phase` with fresh supplies. Build the scene for `save.phase` (`runIntro` from Task 18 for `intro`; `startChapter(ctx, CITY, …)` for day1/night1). Respect the `disposed` guard after every await.
- `begin()` (after the intro pages): if the save was past the intro, `ctx.choose('Continue from ' + phaseTitle(save.phase) + '?', ['Continue', 'Start over'])`; on Start over: `store.clear()`, swap to the intro (fade to black, dispose the chapter, `disposeScene`, run the intro, fade in).
- Moving between scenes (intro → chapter): `ctx.overlay.fade(true)` → dispose old → build new (show `showMessage(overlay, '', 'Loading…')` if it takes > 300 ms) → close the message → `fade(false)` → title page (`phaseTitle`).
- After Night 1 (`onDone`): `ctx.read(['You made it to the boathouse.', 'Night 1 survived.', 'To be continued…'], () => ctx.finish())`. The save already says `day2`, so Plan 3 continues from there.

`chapter.ts` — owns the world and the phase flow (< 300 lines, functions < 50):
- Build: `buildWorld(area)`, add the boathouse prop at the safe spot with its lantern `PointLight` (always present; intensity 0 by day), `createHorde(scene, ctx.audio, grid, sounds.groans, SPAWNER.cap)`, `createFlashlight`, `createBow`, `createFish`, `createPickupMeshes`, `createHud(ctx.overlay.root)`, ambience loops (`water`, `wind`, `night[0]`, `horde` — all started once, volumes driven per frame, never stopped/started), `ctx.player.setColliders(world.colliders)`, sky dome centred on the camera, then `await ctx.stage.renderer.compileAsync(scene, ctx.stage.camera)` so the first zombie never hitches.
- `beginPhase(phase)`: `live = restartPhase(save, live?.hints)`, `health = MAX_HEALTH`, `applyLighting` (`day` or `night`), `horde.reset()`, `bow.reset()`, `fish.reset()` then `fish.arm(strikesFor(live.fed))` at night, `pickups.place(area.pickups, taken)` (day only), day lurkers `horde.spawn(x, z, yaw, DAY_TUNING, lying)`, `scares.reset()`, teleport to `spawnFor(phase, area)`, hints (`pickup` on the first day, `night` on the first night).
- Wait for dark: at `area.waitSpot` (within 2 m) by day, prompt `E: wait for dark` → `ctx.choose('Wait for dark? You cannot come back here.', ['Wait', 'Not yet'])` → on Wait: `save = completePhase(save, live)`, `store.save(save)`, fade to black, `beginPhase('night1')`, fade in, title page `Night 1`.
- Safe spot: at night when `atSafeSpot(camera z, area.safeZ)` → `save = completePhase(save, live)`, `store.save(save)`, `onDone(save)`.
- Death: `takeDamage` from horde hits (`hud.hurt()`, `hurt` hint once); at 0 → `dying` for 1.2 s (camera pitches down, rolls 0.3 rad and sinks to 0.4 m, red vignette to full) → `ctx.read(['You died.', night ? 'The night starts again.' : 'The day starts again.'], () => beginPhase(save.phase))`.
- `dispose()`: stop the updater, stop and disconnect every sound it started, `horde.dispose()`, `bow.dispose()`, `fish.dispose()`, `hud.dispose()`, remove the flashlight from the camera, restore camera roll/pitch, `disposeScene(scene)`.

`play.ts` — the per-frame update the chapter registers (functions < 50 lines each):
1. If `ctx.isPaused()`: consume `KeyF`, `KeyE`, `Mouse0` presses and return (Global Constraint: pause means pause).
2. `KeyF` toggles the light when battery > 0 (click sound); `Mouse0` fires when `bow.ready` and `spend(supplies, 'arrows', 1)` succeeds (empty: click + prompt "No arrows"); `KeyE` → nearest pickup (`collect`, remove its mesh, tape → Task 17's tape pages) → else river edge by day with packs (`canThrow`: `fish.feed`, `fed++`, `fishPacks−−`) → else the wait spot by day.
3. Battery: `drainBattery`, `flashlight.apply`.
4. `horde.update(dt, sense, onHit)`; `bow.update` → `addSupply(arrows, recovered)`; `fish.update(dt, player, horde, night)`; `pickups.update(dt)`; `scares.update(dt, …)`.
5. Night: `nextSpawn(...)` → `horde.spawn(x, z, yaw toward player, NIGHT_TUNING)`; strip = `{ minX: area.landX, maxX: EDGE_X − 0.5, minZ: area.safeZ + 15, maxZ: area.barricadeZ }`; `blocked` = any collider box contains the point.
6. Shack darkness: `dim` eases toward 1 inside a shack, 0 outside (1.5/s); `applyLighting(lights, preset, dim)` only when `dim` changed by > 0.01. First entry → `shack` hint.
7. Ambience: water volume `0.5 · max(0, 1 − (EDGE_X − x)/25)`; wind 0.25 by day / 0 at night; night drone 0.3 at night; horde layer `0.6 · aliveCount / SPAWNER.cap` at night (ease volumes 1/s). Heartbeat loop when health ≤ 34.
8. Sky dome and key light follow the camera; HUD `set(...)`, prompt for whatever E would do.

- [ ] **Step 4: Verify**
- `pnpm vitest run` — PASS; `pnpm run check`.
- Chrome (`?nolock&phase=day1`): walk the city, enter a shack (darkness + hint), pick up a battery (HUD +), shoot a lurker (dies, arrow recoverable), throw a fish pack at the edge (arc, splash, orca rises), wait for dark at the campfire (choice → Night 1 title). Night: zombies spawn ahead in the fog and run; flashlight stuns; the orca takes one near the water; reach the boathouse → "To be continued…" → back to the cards. Die once on purpose: "You died." → the night restarts with the supplies it began with. Esc mid-attack: nothing moves, groans go silent.
- `?nolock&phase=night1&webgl`: same night on WebGL 2.

- [ ] **Step 5: Commit** — `git commit -m "feat(river): chapter flow — day, wait for dark, night, safe spot, death, saves, hints"`

---

### Task 17: Day scares and Tape 1

**Files:**
- Create: `src/dreams/follow-the-river/scares.ts`, `scares.test.ts`, `tapes.ts`, `tapes.test.ts`
- Modify: `chapter.ts`/`play.ts` (wire scares and tapes), `watcher.ts` (export what scares need)

**Interfaces:**
- Produces:
  ```ts
  // scares.ts
  /** Whether the player at (x, z) sets off `def` (distance ≤ its trigger). Ambush scares fire from tapes, not distance. */
  export function triggered(def: ScareDef, x: number, z: number): boolean;
  export interface Scares { update(dt: number, player: { x: number; z: number }): void; tapeTaken(shack: string): void; reset(): void; dispose(): void }
  export async function createScares(ctx: DreamContext, scene: THREE.Scene, defs: readonly ScareDef[], horde: Horde, sounds: Sounds, flashlight: Flashlight, shacks: readonly ShackDef[]): Promise<Scares>;
  // tapes.ts
  export const TAPES: Readonly<Record<number, readonly string[]>>;
  /** Plays the muffled voice on the voice channel while the transcript pages are open. */
  export function playTape(ctx: DreamContext, sounds: Sounds, tape: number, onDone: () => void): void;
  ```

- [ ] **Step 1: Write the failing tests**

`scares.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { triggered } from './scares';

describe('triggered', () => {
  it('fires watcher and alarm scares by distance', () => {
    expect(triggered({ kind: 'watcher', x: 0, z: -40, trigger: 12 }, 0, -30)).toBe(true);
    expect(triggered({ kind: 'alarm', x: -4, z: -66, trigger: 4 }, 0, -50)).toBe(false);
  });

  it('never fires an ambush by distance (the tape sets it off)', () => {
    expect(triggered({ kind: 'ambush', shack: 's3', trigger: 1.5 }, 0, 0)).toBe(false);
  });
});
```

`tapes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TAPES } from './tapes';
import { CITY } from './areas/city';

describe('tapes', () => {
  it('has a transcript for every tape placed in an area', () => {
    for (const p of CITY.pickups) if (p.kind === 'tape') expect(TAPES[p.tape ?? -1]?.length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`TAPES[1]` — exact text:
```ts
1: [
  'The label says: "Day 41. K — don\'t watch this."',
  '[Tape hiss. Mom, close to the microphone.]',
  '"Day forty-one. It ate everything we gave it again. It is growing faster than the model said it could."',
  '"Dr. Rao says the enzyme is stable. It isn\'t. Two of the test mice got out last night. They bit Arun."',
  '"He went home sick. Nobody has heard from him since."',
  '"If you\'re watching this, sweetheart… I\'m sorry. I only wanted to make something that could save the river."',
],
```
`playTape`: `audio.loop(sounds.tapeVoice, 0.5, 'voice')` + hiss, `ctx.read(TAPES[n], () => { stop the loop; onDone(); })`. Show the `tape` hint first the first time.

Scares (all pause-safe, all driven by `update(dt)`; each fires once per phase, re-armed by `reset()`):
- **watcher**: Plan 1's figure (`loadWatcherFigure`, `shouldStrike`, `WATCHER.vanishAfter`) at the def's position, facing the player: sting (`audio.once(sounds.sting, 0.9)`), camera jolt (`shakeAt`), flashlight flicker (`flickerOn` → `flashlight.light.intensity`), figure gone after `vanishAfter`. Stop touching the camera/light once the flicker ends (Plan 1 follow-up).
- **ambush**: `tapeTaken('s3')` → after 0.6 s of silence, `horde.alert` the shack's lurker (it is `lying` behind the shelves; it rises and lunges), sting at full volume, jolt, the flashlight stutters for 1.2 s.
- **alarm**: within `trigger` of the van → `alarm` sound positional on the van, looping for 6 s then stopping; `horde.alert(x, z, 25)` once; the van's indicator lights blink (a small emissive mesh toggled by material colour).
- Night ambience stings: every 25–45 s at night, one random `weird` sting from a random direction at volume 0.35.

- [ ] **Step 4: Run** `pnpm vitest run` — PASS; `pnpm run check`. Chrome: take the tape in s3 → transcript pages with the muffled voice → after closing, the ambush fires; walking past the van sets off the alarm and two zombies come.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): day scares (watcher, ambush, car alarm) and Tape 1"`

---

### Task 18: The intro — the news, Mom, the fish

**Files:**
- Create: `src/dreams/follow-the-river/intro.ts`, `intro.test.ts`, `news.ts` (TV canvas texture)
- Modify: `index.ts` (run the intro for phase `intro`)

**Interfaces:**
- Produces:
  ```ts
  // intro.ts
  export type IntroStep = 'news' | 'mom-leaves' | 'mom-back' | 'outside' | 'throw' | 'goodbye' | 'done';
  /** Pure: the next step after the player finishes the current step's pages. */
  export function nextIntroStep(step: IntroStep): IntroStep;
  export const INTRO_PAGES: Readonly<Record<Exclude<IntroStep, 'done'>, readonly string[]>>;
  export interface Intro { dispose(): void }
  /** Builds the house and riverbank at dusk and runs the intro; `onDone` when Mom sends you off. */
  export async function runIntro(ctx: DreamContext, onDone: () => void): Promise<Intro>;
  // news.ts
  /** A flickering "BREAKING NEWS" screen drawn on a canvas; `update(t)` redraws the scan noise. */
  export function createNewsScreen(): { texture: THREE.CanvasTexture; update(time: number): void; dispose(): void };
  ```

- [ ] **Step 1: Write the failing test** — `intro.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { INTRO_PAGES, nextIntroStep, type IntroStep } from './intro';

describe('intro', () => {
  it('runs news → Mom leaves → Mom back → outside → throw → goodbye → done', () => {
    const steps: IntroStep[] = ['news'];
    while (steps[steps.length - 1] !== 'done') steps.push(nextIntroStep(steps[steps.length - 1]));
    expect(steps).toEqual(['news', 'mom-leaves', 'mom-back', 'outside', 'throw', 'goodbye', 'done']);
  });

  it('has pages for every step, and Mom says the line', () => {
    for (const pages of Object.values(INTRO_PAGES)) expect(pages.length).toBeGreaterThan(0);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/Always follow the river/);
    expect(INTRO_PAGES.goodbye.join(' ')).toMatch(/What have we done/);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`INTRO_PAGES` — exact text:
```ts
export const INTRO_PAGES = {
  news: [
    'BREAKING NEWS — An unknown infection is spreading through the city.',
    '"…patients become violent within hours. Hospitals are not accepting new cases…"',
    '"…residents are urged to stay indoors and lock their doors…"',
  ],
  'mom-leaves': [
    'Mom: "No. No, no, no. That\'s… I know what that is."',
    'Mom: "Stay here. Lock the door. I\'m going to the store. I\'ll be right back."',
  ],
  'mom-back': ['An hour later.', 'Mom: "Come with me. Now. To the river. Don\'t ask."'],
  outside: ['Mom is holding a pack of fish from the store. Her hands are shaking.'],
  throw: ['Mom: "Here. Here, girl."', 'Something enormous moves under the water. Black and white. It takes the fish and is gone.'],
  goodbye: [
    'Mom: "It knows me. It will know you."',
    'Mom: "Listen to me. Whatever happens — run. Always follow the river."',
    'Mom: "Feed it, and it will keep you safe at night. Go!"',
    'She lifts her phone and starts filming the water. You hear her whisper: "What have we done…"',
  ],
} as const;
```

Scene (dusk lighting preset, `buildWorld` is not used — the intro is small and custom):
- Inside: `props/livingroom.glb` at the origin, `props/couch.glb` facing `props/tv.glb` (its `Screen` material replaced by `MeshBasicMaterial({ map: news.texture })`, plus a dim blue `PointLight` in front of it that flickers with the picture — present from the start), a window glowing dusk. Mom (`characters/mom.glb` via `loadSkinned`, `Idle` clip) stands by the TV. Player spawns on the couch looking at the TV. Colliders from the room walls (doorway open) and furniture.
- Outside (a separate spot of the same scene, x +40): `addRiver`, a Kenney suburban house (`kits/suburb/building-type-a`) behind the spawn, a fence line, the sky dome and dusk light.
- Flow (prompts in the HUD prompt line; E to act; pages via `ctx.read`):
  1. Near the TV: `E: watch the news` → `news` pages.
  2. Then near Mom: `E: talk to Mom` → `mom-leaves` → fade out, Mom moved to the door holding the `fishpack` prop (attached to her `Wrist.R` bone), fade in → `mom-back` (E near Mom).
  3. `E: go outside` at the doorway → fade → teleport outside facing the river; Mom at the water's edge → `outside` pages.
  4. Near Mom: `E: stand with Mom` → Mom plays `Interact`, the pack arcs into the water (reuse `createFish(...).feed`), splash, the orca rises (its `Lunge`) and sinks → `throw` pages.
  5. Mom switches to `Idle_Gun_Pointing` (holding up her phone) → `goodbye` pages → `onDone()`.
- Teach as you go: the first prompt shows the `E` key; the intro pages already covered WASD/mouse.
- `dispose()`: stop updaters/sounds, remove the HUD prompt, `disposeScene`.

- [ ] **Step 4: Run** `pnpm vitest run` — PASS; `pnpm run check`. Chrome `?nolock&phase=intro`: play the whole intro; it hands over to Day 1.
- [ ] **Step 5: Commit** — `git commit -m "feat(river): intro — the news, Mom, the orca, 'always follow the river'"`

---

### Task 19: Wrap-up — dev phase jump, docs, release check

**Files:**
- Modify: `src/dreams/follow-the-river/index.ts` (dev `?phase=` only if not already done in Task 16), `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md` (Plan 2 milestone line: orca guardian, people-zombies; art rows), `docs/superpowers/plans/2026-10-03-plan-1-followups.md` (mark what Plan 2 resolved), `CLAUDE.md` (asset rebuild pointer: `tools/assets/README.md`)

- [ ] **Step 1:** Spec: the river creature is an orca ("the fish" in story text stays "it"); zombies are everyday people in their clothes; record the asset pipeline. Follow-ups: tick off disposal, grid, audio channels, contract, presets, asset URLs, progress saves.
- [ ] **Step 2:** Release check (controller, in Chrome; record results in the ledger): production build `pnpm run build && pnpm run preview`; full playthrough intro → Night 1 on WebGPU and `?webgl`; fps on the night run with 14 zombies (target ≥ 60 on this Mac; note numbers); Esc during every system; quit mid-night and re-enter (Continue offered, no lingering audio); corrupt the save in DevTools (`localStorage['kartiks-dreams:follow-the-river'] = '{'`) → fresh run.
- [ ] **Step 3:** `pnpm run check`, then commit `docs: Plan 2 results; spec and follow-ups updated`.
