# Follow the River — Days 2–3 and the Ending (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish "Follow the River": Day 2 in the suburbs and farms (the gun from a crashed police car, Tape 2), Night 2 through the fields to a camp at the forest edge, Day 3 in the forest (Tape 3), Night 3 down to the dam, and the ending — Mom is found alive at the dam, the orca dies holding back the last horde, a bittersweet dawn, credits.

**Architecture:** Plan 2 built every system as data-driven parts (`AreaDef` + `buildWorld` + `startChapter` + horde/bow/fish/scares/pickups/HUD). Plan 3 adds two `AreaDef`s, a chapter router in `index.ts`, a second weapon (the gun) beside the bow, per-chapter night difficulty, Tapes 2–3, and a scripted ending scene modelled on the intro (`ending.ts` + `ending-scene.ts`). No new engine systems.

**Tech Stack:** as Plan 2 (Vite, strict TS, three.js WebGPU/WebGL 2, TSL, SkeletonUtils + AnimationMixer, Web Audio, Vitest, Blender headless + MCP, Kenney/Quaternius CC0, meshopt).

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md` · Plan 2 results: `docs/superpowers/plans/2026-10-03-plan-2-results.md` · Ledger conventions: see Plan 2's ledger.

## Global Constraints

Same as Plan 2 (verbatim there): functions < 50 lines, files < 500 lines, no per-frame allocation, no console/innerHTML, three from `three/webgpu`; `pnpm run check` before every commit; never bright; no world edge; player-paced text; pause means pause (world channel muted, voice channel plays); CC0 art/sound listed in LICENSES.md and loaded via `assetUrl()`; clip changes cross-fade; saves only through `createSaveStore` at phase boundaries; never push; Sonnet subagents only.

Plus:
- **Old saves keep working.** A Plan 2 save (no `hasGun`) loads as `hasGun: false`; a `day2` save from Plan 2 now continues into Day 2.
- **The gun is loud.** Every shot alerts zombies within 40 m and makes the night spawner faster for 8 s. The bow stays silent.
- **The ending is bittersweet, not gory.** The orca's death is shown as exhaustion: it rolls over and sinks slowly; no blood.

## Review Focus

1. Chapter hand-over (night N survived → Day N+1 loads a new area) under failure: a stalled or failed load shows a player-paced message, never a black screen. Pinned by the router tests (Task 2) and the release check (Task 10).
2. Weapon switching mid-action (pause, death, reload, out of ammo, switching while a cooldown runs): no stuck viewmodel, no free shots, counts never negative. Pinned by `weapons.test.ts` (Task 3).
3. Save migration and every phase continuing correctly (intro…night3, end). Pinned by `state.test.ts` additions (Task 2).
4. Night 3's end: reaching the dam starts the ending exactly once even if the player dies at the same moment; Quit mid-ending leaves nothing behind. Pinned by `ending.test.ts` (Task 8) and the release check.
5. Difficulty ramp stays beatable on a laptop: Night 3 cap/interval vs the player's sprint and the fish strikes. Pinned by `difficulty.test.ts` (Task 4) + Chrome check.

---

### Task 1: Assets — nature kit, suburb houses, Blender pistol/dam/barn, new sounds (controller)

**Files:** `public/assets/kits/nature/*.glb` (flat-colour, no textures), more `kits/suburb/*`, `tools/blender/dream1_props.py` (+ `pistol`, `barn`, `dam`, `cabin`), `public/assets/props/{pistol,barn,dam,cabin}.glb`, `LICENSES.md`, `tools/assets/README.md`.

- Nature kit subset (measure with glbsize.py; Kenney nature ≈ 1 unit ≈ 1–1.5 m, use `KIT_SCALE.nature = 4` for pines ~6 m): `tree_pineTallA…D`, `tree_pineDefaultA/B`, `tree_default_dark`, `tree_oak_dark`, `tree_tall_dark`, `rock_largeA…F`, `rock_tallA…E`, `stump_old`, `stump_oldTall`, `log_large`, `log_stack`, `tent_detailedOpen`, `tent_smallClosed`, `campfire_logs`, `canoe`, `crops_cornStageD`, `crops_wheatStageB`, `crops_dirtRow`, `fence_simple`, `fence_gate`, `fence_planks`, `bridge_wood`, `cliff_block_rock`, `cliff_waterfall_rock`, `plant_bushLarge`, `mushroom_redGroup`, `hanging_moss`, `grass_large`.
- Blender (headless + preview in the user's Blender via MCP): **pistol** (viewmodel, ~0.2 m, grip origin, barrel toward three −Z, dark metal, emissive-free); **barn** (red-brown weathered wood 10 × 8 × 7 m, open doors toward +X, dark inside); **cabin** (ranger cabin 5 × 4 m, porch, lantern); **dam** (concrete gravity dam across the river, 40 m wide × 18 m tall, a spillway, a small control house on top-left with a lit window, a service stair down to the bank at the land side — the ending's stage).
- Sounds (procedural, in `sounds.ts`): `gunshot` (sharp noise burst + 60 Hz thump, 0.6 s), `dryFire` (click), `orcaCry` (sine sweep 220→140 Hz with slow vibrato and breath noise, 2.5 s — sad, not scary), `dawn` (soft major pad, slow attack, 12 s loop). Tests like Plan 2's generators.
- [ ] Commit `feat(assets): nature kit, barn, cabin, dam, pistol; gunshot and orca sounds`.

### Task 2: Chapter router + save migration

**Files:** `index.ts`, `state.ts`, `state.test.ts`, `flow.ts`, `flow.test.ts`, `registry.ts` (intro line back to "Survive 3 nights" — now true).
**Interfaces:** `areaFor(phase): AreaDef | null` (`day1|night1 → CITY`, `day2|night2 → SUBURBS`, `day3|night3 → FOREST`, else null); `RunState.hasGun: boolean`; `isRunSave` accepts a missing `hasGun` (Plan 2 saves) and `normalizeSave()` fills it; `completePhase` keeps `hasGun`.
- After night 1/2 survived: page ("You made it to the camp." etc. per area `arrival` text in AreaDef), fade, drop the chapter (stage.scene → empty scene first), build the next area's chapter (withTimeout + failure message, as the Plan 2 final-review fix does for the intro hand-over), fade in, title card "Day N".
- After night 3: hand over to the ending (Task 8). Save `end` → Continue offers "Watch the ending again" / "Start over".
- Tests: routing table; migration (old save → hasGun false; garbage still rejected); completePhase carries hasGun; flow tests for titles of all phases.

### Task 3: The gun and weapon switching

**Files:** `weapons.ts` (+test), `gun.ts`, `controls.ts`, `hud.ts`, `pickups.ts` (kind `gun`: grants the gun + 8 ammo), `areas/types.ts` (`PickupKind` += `'gun'`), `hints.ts` (`gun` hint).
**Interfaces:** `type Weapon = 'bow' | 'gun'`; `nextWeapon(current, hasGun, key)` pure (1 = bow, 2 = gun if owned, wheel cycles); `GUN = { range: 40, cooldown: 0.35, damage: kill, alertRadius: 40, noiseSeconds: 8 }`; `createGun(camera, audio, sounds)` → `{ ready, fire(eye, look, horde, grid): boolean, update(dt), reset(), dispose() }` — hitscan via `horde.rayHit` capped by the first wall (`segmentHitsBox`), muzzle flash = a PointLight created once on the camera (intensity pulse 0.05 s; never added/removed), recoil kick on the viewmodel, `gunshot` sound, `horde.alert(player, 40)`; empty → `dryFire` + prompt "No bullets" (no timer-only text: stays while the button is held).
- Only one viewmodel visible at a time (switch = 0.25 s lower/raise tween, no instant swaps).
- Night spawner: `noise` timer from the last shot halves `SPAWNER.interval` while > 0.
- Hint `gun`: "A police gun. Press 2 for the gun, 1 for the bow. The gun stops anything — but every shot is loud, and they will come."
- Tests (`weapons.test.ts`): switching rules, cooldown, ammo never negative, noise timer, no fire while switching.

### Task 4: Night difficulty per chapter

**Files:** `difficulty.ts` (+test), `play.ts`, `brain.ts` (tuning per chapter), `spawner.ts` (interval/cap from difficulty).
`NIGHT_DIFFICULTY = { 1: { cap: 14, interval: 2.2, speed: 3.5 }, 2: { cap: 18, interval: 1.9, speed: 3.6 }, 3: { cap: 22, interval: 1.6, speed: 3.7 } }`; day lurker sight/speed unchanged. Horde capacity = max cap (22) — check fps in Task 10; if needed, drop shadows to the nearest 3.
Tests: monotonic ramp; Night 3 still slower than the sprint (4.2 m/s); cap ≤ horde capacity.

### Task 5: The suburbs and farms (Day 2 / Night 2)

**Files:** `areas/suburbs.ts` (+test like `city.test.ts`), `areas/types.ts` (optional `arrival: readonly string[]`, `safeProp` for the night's safe spot: `{ prop: string; x: number; z: number; yaw: number }`).
Layout (river edge x = 3, play strip x −18…3, z 14 → −415):
- Day zone z 10 … −120: a residential street parallel to the river (suburb houses at x −22…−30 facing the river, white picket fences, driveways, parked cars; `building-type-*` ×8), two garages (shack builder, 2 × 2 tiles) and the **barn** (z −90, x −16, big, dark, Tape 2 inside + a lying zombie behind hay), the **crashed police car** at an intersection (z −45, x −5) with the `gun` pickup on the driver's seat + 8 ammo, batteries/arrows/fish packs (2 fish packs), 4–5 lurkers (garages, barn, one lying on a lawn).
- Scares: `watcher` = a scarecrow-like still figure at the cornfield edge (reuse the watcher model, z −70, x −14, trigger 14); `ambush` in the barn after Tape 2; `alarm` on a parked car at z −30.
- Night route z −120 … −400: farmland — corn rows (`crops_cornStageD` in batched rows, *not* collidable but they hide zombies), fences, a tractor, power poles, silos (boxes) on the land side; the night's safe spot = a **ranger camp at the forest edge** (`tent_detailedOpen` ×2 + `campfire_logs` + the cabin prop) at z −402.
- `arrival`: ["You reach a ranger camp where the fields meet the forest.", "Night 2 survived."].
- Tests: unique ids, one tape (2), one gun pickup, every spot on the strip, pickups not in walls/props, gun reachable from the road, nothing collidable in the river.

### Task 6: The forest (Day 3 / Night 3)

**Files:** `areas/forest.ts` (+test).
- Day zone z 10 … −120: dark pine forest on the land side (dense batched pines at x −14…−60 so the strip feels closed in), a campsite with abandoned tents (lurkers lying inside), the **ranger cabin** (shack builder 2 × 3 or the cabin prop + colliders) with Tape 3, a fallen-log bridge over a creek mouth, rocks, stumps, moss; fish packs ×2, batteries ×2, ammo ×2, arrows ×2.
- Scares: `watcher` between trees (z −50), `ambush` in the cabin after Tape 3, a new `kind: 'snap'` scare (a branch snap sound behind the player + a zombie lying across the path rises; data-only if the existing kinds can express it — prefer reusing `ambush`).
- Night route z −120 … −380: forest thins to rocky banks, the river narrows visually (rocks/cliffs on the far bank), then **the dam** across the river at z −395 (the dam prop + its walls as colliders; the river ends at the dam). No safe spot — reaching the dam's service stair (z −380, x −2) starts the ending (Task 8): `endingAt: { x, z, radius }` in AreaDef instead of `safeZ` (keep `safeZ` for the spawner quiet zone).
- Fog closer at night here (forest preset: night fog far 45).
- Tests as for the city/suburbs + the dam blocks the river and the strip end.

### Task 7: Tapes 2 and 3

**Files:** `tapes.ts` (+test).
- Tape 2 (barn, "Day 63"): the fish (orca) had been growing in the lab tanks; it was gentle, it learned Mom's voice; the enzyme that made it grow was the same one that went wrong in the mice; the lab director buried the reports; Mom took samples home; she's afraid.
- Tape 3 (forest cabin, "Last tape"): the outbreak started at the lab by the dam; Mom released the orca into the river to keep it from being destroyed and because "it will protect you — it knows my voice"; "If you're watching this, you followed the river. I'll be at the dam. That's where it started. I'm going to fix what I can."
- Write each as 5–6 short player-paced pages in Mom's voice (no gore), plus the label line. Tests: every placed tape has text.

### Task 8: The ending

**Files:** `ending.ts` (+test), `ending-scene.ts`, `index.ts` (hand-over from night 3), `sounds.ts` (`orcaCry`, `dawn` used here).
Flow (player-paced pages between short unpaused beats, like the intro):
1. Reaching the dam stair → fade → Mom at the control-house door with her phone and a lantern: pages ("It's you. You followed the river." / "I'm so sorry. For all of it.").
2. A final horde comes along the bank (scripted wave of 12 already-running zombies from upstream); the player fights from the stair (weapons live) while the orca strikes again and again — beyond its strike count — for 25 s of game time.
3. The orca's last lunge: it takes three at once, then rolls over and sinks slowly (rotation + y over 6 s, `orcaCry` once); the remaining zombies are taken by the water (dragged) — the bank is clear.
4. Silence (wind only) → pages: Mom: "It held on for us. It held on for you." / "We made it. Because of it."
5. Dawn: lighting lerps night → a new `dawn` preset (still dim and grey, a pale sun rising over the dam) over 8 s; the `dawn` pad fades in.
6. Epilogue pages (bittersweet, 3–4), then credits pages ("Kartik's Dreams — Follow the River", "A dream by Kartik", asset credits: Kenney, Quaternius, OpenGameArt contributors, "Made with three.js"), then `ctx.finish()`. Save phase `end`.
- Pure `nextEndingStep(step)` + `ENDING_PAGES` tested like the intro; the wave + orca beats are pause-safe and disposed-guarded; Quit mid-ending is clean.

### Task 9: Hints, balance and polish pass

**Files:** `hints.ts`, area data, `play.ts`.
- First-time hints for: the gun (on pickup), Night 2 ("Corn hides them. Listen.") , Night 3 ("The dam. Mom is at the dam.").
- Supplies per area tuned so a careful player arrives at each night with ≥ 1 fish pack and ≥ 50 % battery.
- Day 2/3 title cards and `announce` text; HUD shows ammo once the gun is owned.

### Task 10: Release check and docs (controller)

- Full playthrough in Chrome via the frozen playtest worktree (intro → Day 1 … Night 3 → ending), WebGPU and `?webgl`; draw calls per area; a Night 3 stress (22 zombies) frame-time check; Quit mid-ending; corrupt save; Plan 2 save migration.
- Update the spec (Plan 3 milestone), Plan 3 results doc, resume-state memory, LICENSES.
- Final whole-branch review, fixes, merge to local `main` (no push).
