# Plan 4 — A river that looks like a river, and an orca you can see

**Why:** Kartik played the merged game and found three problems. The water sits almost level with the ground (`y −0.15` vs `0`) with no banks, so it reads as a wet road. The river is narrow (14 m). The orca cruises about 1 m under black water, so he never sees it. He asked for:

- A wider river.
- City banks walled like a city river.
- Natural banks in the country and forest (the land slopes down through mud and silt into the water).
- Water that visibly flows and reflects.
- An orca he can find.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md` (never bright; no world edge; CC0 only; performance first).

## Global constraints

- Shared constants live in `src/dreams/follow-the-river/river.ts` and nowhere else:
  - `RIVER_WIDTH = 30`, so `EDGE_X = 3`, `FAR_EDGE_X = 33` and `RIVER_X = 18`.
  - `WATER_Y = −1.0`, one height for rivers, lakes and banks. The walkable ground is `y 0`.
- Far-bank placements are relative to `FAR_EDGE_X`. A literal far-bank x is a bug.
- No texture files. Water normals and ripples are procedural (three's example water textures are not CC0).
- Everything stays dim at night: reflections show the moon, lit windows and lanterns, never a bright sky.
- No per-frame allocations. Functions under 50 lines, files under 500 lines.
- The WebGL 2 fallback (`?webgl`) must still load and look right.

## Tasks (parallel, disjoint files, same worktree, no commits by agents)

### Task 1 — River geometry and banks (river.ts, world.ts, skyline.ts, intro-scene.ts, areas/*, tests)

- Set `RIVER_WIDTH = 30` and `WATER_Y = −1.0`. Water spans `EDGE_X…FAR_EDGE_X` at `WATER_Y`, via `createWaterMesh` from water.ts (do not edit water.ts).
- Bank strips run the full river span on both sides, as one long mesh per side built from a cross-section (vertex colours, Lambert).
  - **`embankment` (city):**
    - Kerb at `y 0` over `x 2.4…3.0`, colour `0x6b6a66`.
    - Vertical wall at `x 3.0` from `y 0` down to `y −2.2`, colour `0x2f2e2c`.
    - Dark iron railing along `x 2.8`: posts 0.9 m tall every 2.5 m plus two rails, merged into one geometry per side, colour `0x1c1c1e`.
    - The far side mirrors this at `FAR_EDGE_X`.
  - **`natural` (suburbs, forest, intro):** a profile of (x, y) points:
    - `(3.0, 0)` grass
    - `(4.2, −0.35)`
    - `(6.0, −0.85)` mud
    - `(7.0, −1.05)` wet sand, just under the water
    - `(10, −2.2)` riverbed
    - Colours: grass → `0x3a3226` mud → `0x2c2820` wet sand. The far side mirrors it about `RIVER_X`.
    - Reeds and grass clumps every 3–5 m (seeded), just above the waterline on both sides: nature kit `grass_large` and `plant_bush` at scale ≈ 0.5. They are not collidable.
- Far-bank land is `y 0` east of the far bank top, running out into the fog. The flat ground's old mud edge strip goes.
- **Forest lake:**
  - Pebble shores slope from `y 0` at `lake.z + 6` down below `WATER_Y` at `lake.z − 2`, so Mom stands on land and the shore meets the water.
  - Lake water sits at `WATER_Y`.
  - The dam is centred on `RIVER_X`.
  - The forest's "river mouth stays open" gap uses `FAR_EDGE_X`.
- Every far-bank x moves to `FAR_EDGE_X + (old x − 17)`: skyline far items, forest pines and rocks, suburbs far-bank things, `lakeRects.pebblesEast`.
- **Intro:** the home's river uses natural banks. Mom's throw spot stays on land at the edge.
- **Tests:**
  - Profile y at `EDGE_X` is 0.
  - The natural profile crosses `WATER_Y` between x 4.2 and 7.
  - Every far-bank prop and skyline item has x ≥ `FAR_EDGE_X + 1`, in every area.
  - The river collider spans `EDGE_X…FAR_EDGE_X`.
  - The lake shore reaches below `WATER_Y`.

### Task 2 — Water that flows and reflects (water.ts only, plus water.test.ts if it adds pure helpers)

- Keep `createWaterMesh(width, length, look?)`; Task 1 calls it. Add a planar reflection: three r186 `reflector()` from `three/tsl`, as `WaterMesh.js` and `Water2Mesh.js` in `node_modules/three/examples/jsm/objects/` use it. Attach `reflection.target` to the mesh, with `resolutionScale` 0.25–0.5.
- Distort the reflection by procedural ripple normals: scrolling noise that flows downstream (toward −Z) and visibly drifts.
- Use a fresnel mix toward `look.deep`. Reflection strength stays low (never bright).
- Keep a faint glow so the flow reads outside the flashlight.
- The lake look (`LAKE_FLOW`) is still: no drift, a mirror-like dark surface.
- Report ms/frame and draw calls before and after on WebGPU and `?webgl` if you can measure them; otherwise say so.

### Task 3 — An orca you can see (fish.ts, fish-parts.ts, fish.test.ts, sounds.ts, sounds.test.ts)

- **Height:** `CRUISE_Y = WATER_Y − k`, where k leaves the dorsal fin about 0.5 m above the water. Measure the fin from the model's bounds (orca.glb, built by `tools/blender/orca.py`), don't guess.
- **Where it swims:** beside the player's bank, not mid-river.
  - x = `EDGE_X + 4` ± 1.5 weave.
  - About 6 m ahead downstream of the player (`player.z − 6`), so it's in view when you look where you're going.
- **Surfacing:** every 18–30 s when not striking, it surfaces for about 2.5 s: back and fin out, a slow roll, a splash ring, and a new procedural `blow` sound (a breathy 0.6 s filtered-noise whoosh), positional.
- **Night look:** a wet sheen (lower roughness) so moonlight and the flashlight catch it. Still dim.
- **Strikes and the finale:** they keep working, with water heights from `WATER_Y`.
- **Tests:** the cruise target sits inside `[EDGE_X + 2.5, EDGE_X + 5.5]`, the fin top is above `WATER_Y`, and the surfacing schedule is a pure helper.

### Task 4 — Sweep (controller)

- Run `pnpm run check`.
- Check in Chrome:
  - Every area by day and night, the intro and the ending, with screenshots saved.
  - Night fog still shows the far bank as a silhouette.
  - Draw calls and ms/frame before and after.
  - `?webgl` loads.
  - Re-run the three night sprint tests.
  - The orca is visible by night.
  - Mom stands on land.
- Fix what breaks, then a final review, then merge to local main.

## Later (not this plan)

- Back-story told through short animated scenes (Kartik: "back story can be through animations as well").
- First-person hands holding the bow and gun.
