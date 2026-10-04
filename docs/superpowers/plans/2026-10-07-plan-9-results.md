# Plan 9 results

TODO (controller): the A15 farewell fix round (task-A15-fix1) and the final whole-branch review are still pending. Update this file when they land.

Plan: `docs/superpowers/plans/2026-10-07-plan-9-flawless.md`. Branch `plan-9`. Record of every task, review and Chrome check: `.superpowers/sdd/2026-10-07-plan-9-flawless/progress.md`.

## What changed

### Story and animation (A1 to A16)

- A1: home fades back in after the credits, the intro throw is the old gentle toss, the HUD shows only the wave number, canoe scenery sits on the ground, Mom's lantern light is inside the lantern.
- A2: the orca is Dras (Subject R-7), Kartik is named, the naming tape exists, the flashbacks are swapped. The tank flashback holds on the player's page, not a timer.
- A3: cutscene mode hides weapons and HUD and holds input. Head bob eases out, weapon keys are ignored, the torch is restored after, and a restart mid-cutscene is clean.
- A4: natural banks drop straight to the water, so the player can reach it. Dras cruises in the water only.
- A5: Story, Normal and Hard. Short stuns, scarce supplies, two body hits to kill on Normal and Hard, arrows that hit are not recoverable (Story only).
- A6: waves keep coming until the wave is dead, longer zones, each wave harder, supplies by the water, an objective line. Spawns never pop in view and wave corpses wake when passed.
- A7: Dras rebuilt to real orca anatomy (eyes, jaw that opens, a female's falcate fin). 11.8k triangles, 89 KB, 7 m.
- A8: sickness the real way. Black and white stay, lesions and wasting grow with every zombie she eats. The strand sets sickness to 1 (red breath). Old saves load with `eaten` 0.
- A9: Dras kills in her jaws, throws the swept, guards you and Mom in the last stand, swims in visibly and lies on the shore (spine sags onto the pebbles).
- A10: Kartik's body and first-person arm, Mom's new mocap clips, head-look and hand IK (`createCharacter`).
- A11: the intro phone and Film pose. Mom looks at you. The phone sits in her palm with the screen facing her (tested on the real rig).
- A12: real recordings replace every synthesised Dras sound (blows, splashes, calls, clicks), paddle strokes in sync with Mom's rowing, birds at sunrise, no synth drone. The paddle now dips into the water so strokes fire.
- A15: the farewell as a cinematic (both hands on her, she looks at you, the orbit, the last fish pack, the wake scroll). The first round is committed (e7d8064); the fix round is pending.
- A16: canoe ride with a speed profile, story beats, Kartik in the bow, an end shot and replay. Inner hull floor, Mom's hands grip the paddle by IK, the end shot cuts in clear of both heads and always ends.
- A17 launch prep: `?webgl` Night 1 and canoe checked, old saves checked, docs and licences (this pass).

### Graphics (G1 to G10, plus H1)

- G1: full-resolution image, AgX, TRAA, GTAO (High full-res 32 samples, Medium half-res 16), colour grades, depth of field in cutscenes, adaptive quality tiers. SSGI was dropped because it left static grain.
- G2: physical sky, image-based light, cascaded moon and sun shadows, a real sunrise, round moon with halo, overcast day.
- G3: volumetric mist (torch beam and lantern light the fog), a torch that actually lights the ground ahead, one sun direction for sky and key light. God rays were dropped (no visible effect after three rounds).
- G4: moving river (foam, finer ripples, moonlight glint), torch exposure cap on the nearest face, matte character materials (the Quaternius materials loaded as shiny half-metal, the cause of "firecracker" Mom).
- G4b: natural lake shore, wandering banks, the river bending away into the fog. The walkable strip stays straight.
- G5: seven Poly Haven PBR sets (asphalt, pavement, mud, grass, forest floor, pebbles, dirt), puddles, textured road and sidewalk tiles that keep their lane lines.
- G6: Quaternius MegaKit trees, plants and dense grass with wind, instanced per area, 60 m cells culled by distance, dithered near/far swap.
- G7: splash spray, mist, dust in the torch beam, fireflies, embers, falling leaves (one draw each).
- G8: characters and Dras lit like the world (faint moon rim on the dead, wet sheen on Dras, her head in the torch's exposure).
- G9: the visibility pass (see below).
- G10: Dras' wake is soft, broken, fading water instead of two hard lines.
- H1: slow ceiling fan in the bedroom, ceiling lit by the lamp.

### Performance (P1)

Harness numbers are sequential CPU+GPU on an Apple M3 Pro in a hidden tab, so they overestimate frame time. Format: median / p95 ms.

- Infra: frame cap (90 default), Auto starts from the GPU class, `?perf` probe with GPU timestamps, `?gpuload=N` knob. WebGL fallback starts on Medium. Auto is fed work time, not frame time.
- Round a (one tier table, cheaper reflection, shadows and AO per tier, no mirror on Low), Night 3 forest: Low 9.1/11.6 (508 draws), Medium 21.6/39 (1576), High 26.1/33.2 (1578).
- Round b (skyline merged per 128 m cell, pickups merged, small props off shadows and reflection): Low 142 draws, 4.8-5/8; Medium about 1120 draws, 20-24/23-37; High 1132 draws, 20.5/23.6.
- Round c (one shared reflection per group, no shadow re-render in the reflection pass, all water hidden during its own pass): Low 147 draws 4.2/6.9; Medium 350 draws 6.4/9.5; High 348 draws 7.4/12.2.
- Vegetation budgets (built-mesh test): forest 268k/764k/1.06M triangles Low/Medium/High, suburbs 260k/450k/729k, canoe 239k/517k/1.49M.

### Visibility pass (G9)

Cause: area ground tints multiplied into dark textures and a weak hemisphere light. Before: day 0.17 mean luminance / 27-29% crushed, night 1 0.067 / 65%, intro dusk 0.043 / 68%. After: day 1-3 0.285-0.297 / 2-4%, night 1 0.099 / 54%, night 3 0.105 / 48%, intro room 0.217 / 5%, intro dusk 0.191 / 21%. Still horror: overcast, foggy, dark nights, readable.

### End soft-lock fix

The ride end froze because `disposeScene` threw (`reading traverse`): `CSMShadowNode.dispose` removes cascade lights while the scene is being walked. It now walks a snapshot (7d31a8e, tests with a real `attachKeyShadows`). Nine callers, every shadowed scene. Also fixed: terrain winding was clockwise, so canoe banks were back-face culled and the "snow" was the water plane (45cd31f).

## What was checked in Chrome, and how

- Every task ended with a player's-eye check on the live game, not only unit tests. Controller ran them; implementers have no browser.
- Frozen playtest builds: detached worktrees pinned to a commit, own port, so WIP never moved under a check.
- Hidden tab: rAF is paused and the timer zeroes delta, so game time was stepped frame by frame. A stepped screenshot after a long JS call is often black, so a few frames are stepped in a separate call first.
- `?webgl`: screenshots copied with `drawImage` into an overlay canvas right after a stepped frame (`preserveDrawingBuffer` is false). Night 1 and the canoe ride render right.
- Luminance probe: mean sRGB luminance and crushed share per scene (numbers above).
- Perf: `kd.perf` per-frame values and draw counts at fixed spots, per tier.
- Measured examples: torch stun 0.92 s; first body arrow leaves a zombie alive, second kills; arrows 6, 5, 4, 3 as hit, kill, miss; paddle blades dip to y -0.062 with 17 of 50 frames under the surface; the end shot's rail distance stays at or above 0.6 m over 1001 samples.
- Not checked in a real browser session by a person: see "Check by hand".

## Rulings (one line each)

- Ledger lives in the skill's workspace path, not the plan's.
- A8 "small steps" test is written per colour channel.
- A9 adds `guard: Infinity` to the night strike and `cruiseY` to `newStrand`.
- Final whole-branch review is on Sonnet (Kartik's rule), mitigated by per-task reviews and Chrome checks.
- Chrome checks are run by the controller after each review.
- Long asset jobs ran as parallel background asset agents; code tasks ran serially, later in parallel on file-disjoint tasks with the controller committing.
- Mom's lantern look was verified in the Night 3 ending run.
- Kartik asked for showcase graphics: Track G replaced A13, A14, B1, B2, B3.
- Bedroom ceiling fan added as H1 (built in Blender, CC0 original).
- No true curve of the play path (too many dependants); the river visibly bends beyond the walkable strip instead (G4b).
- SSGI dropped for full-res GTAO plus TRAA.
- Custom god rays dropped after three rounds without a visible effect.
- Torch "eye adjustment": cap illuminance on the nearest face in the beam, keep the far pool.
- Matte character materials at load (root cause of sparkly Mom).
- MegaKit as five category GLBs with named nodes, not one GLB per model.
- No red foliage models in this theme.
- All Dras sounds replaced with real recordings; synthesis only as fallback.
- Frame cap setting (default 90) after the controller's uncapped loop pinned the GPU.
- Paddle strokes re-cut from EpicWizard (CC0) instead of the hissy kayak take.
- The dispose-crash task was filed as "B1" by mistake; read it as D1.
- B4 (first-person arms on weapons) is optional and was skipped.
- Small, test-backed diffs were accepted by controller reading instead of a separate re-review.

## Known gaps and deferred items

- Plan B4 (arms on the weapons) not done.
- Dras sickness, flinch and farewell polish: Mom flinches only within 4 m of a strike; A15 fix round pending.
- Dawn end state at the lake is still hazy at about 14 s; the Night 1 promenade walkway under the torch reads smooth grey; canoe ground a little dark (lift `CANOE_BANK` gain from about 0.5 toward 0.75); canoe inner floor near-black.
- Canoe and flashback water are not tier-seeded (one recompile on first use).
- Distant zombie shadows are limited to the nearest 4 within 15 m every 0.5 s.
- No up-to-1.2 m beach curve (pinned zones cover the beach); bent water uses 10 m rows; props in the overrun are not bent.
- Minors recorded in the ledger: `words.test` copies control prompts as literals; no test for `play.reset` wiring, `lightTorch` or the torch watch slots; `orca-model.test` and `fan.test` read GLBs through a lossy `?raw` string; stale comments about god rays in `dawn.ts` and `grade.ts`; pending and tracked wave lists silently drop past 16 (max placed is 7); `orca.py` is about 580 lines (build script).
- Measured frame times come from a sequential harness on an M3 Pro, about 2.5 to 5 times an integrated GPU. Real rates are unmeasured.
- Two ambience and sting source mappings are not recorded (see `public/assets/LICENSES.md`, "TO VERIFY").

## Check by hand (Kartik)

- Every sound by ear: Dras' blows (the source is windy), her calls and clicks, splashes, paddle strokes, birds, shotgun, rifle and pistol.
- Pointer lock and Esc: the harness used `?nolock`. Check click to lock, Esc to pause, Resume relocks, and the cutscene Esc path.
- Safari (WebGPU or WebGL fallback, audio start, full screen).
- Real frame rate on an integrated-GPU laptop. The harness overestimates; check Low, Medium and High, and that Auto settles sensibly.
- One full play-through with mouse and keyboard, on the difficulty you choose: intro, Day 1 to Night 3, the farewell, the canoe ride and credits, then "Watch the ending again".
