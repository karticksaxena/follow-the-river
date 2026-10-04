# Plan 9: the last iteration ("this should be picture perfect, then we launch")

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (Kartik's choice) to carry this out task by task. Steps use checkbox (`- [ ]`) syntax.
> - Use `grounded-research` for any asset, sound, API or version; use the repo skill `webgpu-threejs-tsl` for every three.js / TSL change.
> - Subagents run on Sonnet only (`model: "sonnet"`). Blender and asset-building tasks go to Sonnet agents with exact briefs; the controller reviews their output by eye.
> - Work in a git worktree `.claude/worktrees/plan-9` (branch `plan-9`) with its own Vite port (5180). :5173 is Kartik's: never touch it.
> - Commit per task (upgrades in their own commits so a regression can be bisected). When everything is verified, fast-forward local `main`. NEVER push.

**Goal:** fix every one of Kartik's play-test complaints (sections 2 and 3) and ship the graphics and animation upgrades he chose, so the game can launch with no visible issue.

**Architecture:** Two tracks. **Track A** (Tasks A1–A16) is launch acceptance: every numbered complaint plus his answers (Dras rename and naming tape, difficulty, Kartik's model, the farewell cinematic, the canoe ending). **Track B** (Tasks B1–B5) is the look-and-feel upgrade (full-resolution render, AgX, GTAO, SMAA, a physical sky, Quaternius nature models, wind, extra mocap clips). If time runs out, A done and B partial is shippable; the reverse is not. Each task ends with a player's-eye Chrome check (section 0), not only unit tests.

**Tech Stack:** Vite, TypeScript strict, three.js r186.1 `WebGPURenderer` + TSL (`three/webgpu`, `three/tsl`, `three/addons/...`), Vitest, oxlint, Prettier, Blender 4.x headless for assets, macOS `afconvert` and Python stdlib for sounds.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md`. Kartik's feedback and answers below are binding and override it (notably: the spec's "540-row render" is replaced by Track B1).

**State at writing:** `main` at `b20de62` (Plan 9 docs on top of `851f1b8`), 402 tests, `pnpm run check` green.

## Global Constraints

- Imports: three core from `three/webgpu`, TSL from `three/tsl`, addons from `three/addons/...js`. No `three` alias.
- Never bright: dark night and fog colours, dim lights. The one deliberate exception is the sunrise (the end of the farewell and the canoe ride). Light and fog values are named constants.
- No world edge: ground and water run past the play area and fog ends the view.
- Player-paced text only (`ctx.read` / `showPages`), never timers. No em dashes in game text.
- DOM text via `textContent` / `el()`; no `innerHTML` with dynamic strings; no `console` in committed code.
- Saves only through `createSaveStore`; corrupt or old saves (v1, v2 without new fields) and old settings must load.
- Assets CC0 (US-government public-domain recordings are allowed and listed as such); every new file listed in `public/assets/LICENSES.md` with source URL and licence; rebuild steps in `tools/assets/README.md`.
- No per-frame allocation in hot loops; functions < 50 lines; files < 500 lines.
- `pnpm run check` (lint + typecheck + format + tests + build) green before every commit.
- Desktop only, keyboard and mouse. `?webgl` (WebGL 2) must render everything WebGPU renders.
- Never hardcode versions in docs.

## Review Focus

1. **Esc / pointer-lock loss in the middle of a cinematic** (the farewell, the canoe ride): the pause menu opens, Resume returns to the cinematic, and afterwards the weapons, HUD and controls come back exactly once (no weapon in view during the cinematic, none missing after). Test it in Task A9.
2. **Death or quit mid-ending or mid-canoe**: no cutscene flag left on, no creature left stranded, no black fader, no HUD hidden on the next run. Tested in Tasks A9 and A11.
3. **`?webgl`** with GTAO, SMAA, DOF and the physical sky renders the same scenes (not black, no shader error). Tested in Task B1 and the final QA.
4. **Old saves and settings** without `difficulty` (and v1 saves) load and default to Normal. Tested in Task A6.
5. **Window resize and the adaptive resolution**: no oscillation (hysteresis), changes at most every 2 s, never below the floor, reflector and bloom targets follow. Tested in Task B1.

---

## 0. HOW TO TEST (Kartik's main complaint: "what do you even test?")

Every task ends with a **player's-eye check** in Chrome, not just numbers. Look at each screenshot and ask: "would a player think this is broken?" Specifically check:
- object colours against a reference (Dras must stay black and white, sick blotches only as the story says);
- the viewmodel and HUD during cutscenes (must be gone);
- objects floating or sunk; things popping in;
- whether text matches the animation on screen at that moment;
- light that blows out faces or water (bloom, lantern, sun glare);
- fade state after transitions;
- frame time (median and p95, GPU-waited).

**Chrome harness** (the tab is hidden; Chrome throttles rAF and `setTimeout`; tested this session):
```js
Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});
for (let i=0;i<50 && !window.kd;i++) await new Promise(r=>setTimeout(r,200));
const anim = kd.stage.renderer._animation, loop = anim._animationLoop; anim.stop();
window.__T = performance.now();
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
window.__step = async (n, dt=16.7) => { for (let i = 0; i < n; i++) { window.__T += dt; anim.nodes.nodeFrame.update(); loop(window.__T); if (i % 5 === 0) await tick(); } };
window.__click = (label) => { const b=[...document.querySelectorAll('#overlay button')].find(b=>b.textContent.includes(label)); b?.click(); return !!b; };
window.__panel = () => document.querySelector('#overlay .panel')?.textContent?.slice(0,160) ?? null;
const st = document.createElement('style'); st.textContent='*{transition-duration:0ms !important}'; document.head.append(st);
window.__pressE = async () => { window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'})); await window.__step(2); window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE'})); await window.__step(2); };
window.__gpuFrames = async (n) => { const dev = kd.stage.renderer.backend.device; const t=[]; for (let i=0;i<n;i++){ const a=performance.now(); window.__T+=16.7; anim.nodes.nodeFrame.update(); loop(window.__T); await dev.queue.onSubmittedWorkDone(); t.push(performance.now()-a);} t.sort((x,y)=>x-y); return {median:t[n>>1], p95:t[Math.floor(n*0.95)], max:t[n-1]}; };
```
- Boot: `__click('Start')`, `__step(260)`, `__click('Follow the River')`, `__click('Enter the dream')`, then loop `__step(5)` + 100 ms waits until `window.kdRiver`, then skip pages (click `Skip`, else `Continue`).
- Fades resolve through `setTimeout` (throttled in a hidden tab): after a transition, if the screen is black, check `document.querySelector('.fader').className` and remove `black` by hand.
- Closing a reader under `?nolock` can pop the pause menu: click `Resume`.
- Teleport: set `kd.stage.camera.position` (the player moves the camera itself). E: `__pressE()`.
- **Before overriding anything on `kdRiver` (for example `horde.spawn`), keep the original** (`const spawn = kdRiver.horde.spawn;`). Overwriting it without a copy cost a page reload this session.
- `kdRiver` is the chapter's `Systems` (`ctx`, `horde`, `fish`, `gates`, `world`, ...); `Run` is not exposed (Task A9 adds `window.kdRun` in DEV).
- Scene modules directly: `await import('/src/dreams/follow-the-river/canoe-ride.ts')`; a fake `ctx` for the ride: `{stage: kd.stage, overlay: kd.overlay, audio: kd.audio, keys: kd.keys, isPaused: () => false, hold(){}, read(pages, done){ window.__reads.push({pages, done}); }, choose: async()=>0, finish(){}}`.
- The page reloads on any file edit: re-run the setup. Use a frozen detached worktree for long play-throughs (`git worktree add --detach .claude/worktrees/playtest9 HEAD`, own port).
- Frame time: `await __gpuFrames(300)`. Baseline measured this session: Night 3 dawn at 1108×540 = median 2.7 ms, p95 4.6 ms.

---

## 1. Kartik's answers (binding)

| Topic | Decision |
|---|---|
| Name in tapes / dialogue | **Kartik** (replace "K." everywhere Mom says it, e.g. tape 1 "K, don't watch this", tape 3 "It will protect you, K"). |
| Difficulty | **Menu when entering the dream: Story / Normal / Hard. Normal is the default.** Story is close to today. Normal: scarce ammo, short stuns, waves that keep coming. Hard: less ammo, faster zombies, bigger waves. Saved in settings. |
| His model | **Young man, casual**: Quaternius Ultimate Modular Men (CC0, same family as Mom), casual outfit (t-shirt, jeans), dark hair. Used for the third-person farewell orbit and the canoe zoom-out. His first-person hand/arm comes from the same model. |
| Ammo | **Crates get smaller. Small ammo and arrow pickups lie along the river edge** (the orca's side) to pull the player to the water. Arrows get scarce too. |
| Creature's name | Mom calls it **"Dras"**. |
| Lore | The lab calls it **"Subject R-7"**: a **freshwater orca variant engineered to clean the river** (real orcas live in the sea). **New short flashback cutscene: Mom naming it "Dras" at the tank.** On-screen text never says "orca" again: use Dras / the subject / it. |
| Naming scene placement (asked 2026-10-04) | **Tape 1 becomes the naming**: Day 1's tape shows Mom at the tank: Subject R-7, a freshwater orca variant made to clean the river, and she names her Dras. The old tape 1 lines (the escaped mice, Arun) move into tape 2. |
| Graphics (asked 2026-10-04, after Kartik compared it to the threejs.org showcase) | **Sharp stylised.** Keep the low-poly art, but: full-resolution render with adaptive quality holding 60 fps (replaces the 540-row render), anti-aliasing, AgX tone mapping, ambient occlusion (GTAO) so things sit on the ground, a physical sky (`SkyMesh`: real sunrise, moonlit night), soft moon and sun shadows, wind in trees and grass, mist and splash particles, depth of field in cutscenes, and Quaternius' nicer CC0 nature models. This overrides the spec's "540-row render" line. |
| Animation (asked 2026-10-04) | **Full pass.** More Quaternius UAL CC0 mocap clips (talking, crouching, filming with the phone, sit-down/get-up transitions), heads turning to look at you, hands placed exactly on the creature (IK), a smoother swim with a moving spine, the farewell's head lift and eye turn, and smooth spline camera rails for cutscenes. |
| Kartik's look (asked 2026-10-04) | **Medium-brown skin**, dark hair, dark t-shirt, jeans. |

## 2. Kartik's feedback, item by item

**Intro**
1. The overhand **Throw looks like a baseball pitch**. Revert to the old gesture: `mom.play('Interact', true)` in `intro.ts` `throwAction` and `THROW_DELAY` back to 0.7. The Throw clip can stay in the GLB, unused.
2. When Mom **lifts her phone and films** ("What have we done?" whisper) **there is nothing in her hand**.
   - Add a phone prop (a small dark box with a lit screen) parented to `WristR`, the same way `createMom` parents the pack.
   - Show it only while she films. Find where the intro plays `Idle_Gun_Pointing` (`intro.ts` ~260).

**The creature, every night**

3. **It turned WHITE. Root cause found:**
   - `orca.glb` has 3 materials: `orca-black` 0.012, `orca-white` 0.8, `orca-grey` 0.16.
   - `orca-sick.ts` `tintSick` does `m.color.copy(white).lerp(sick, k)` on EVERY material, so the black body went white from Night 1 (k=0.1).
   - Fix: remember each material's original colour and keep the black and white.
4. **Sickness should show gradually, the realistic way** (researched; sources in the conversation: CBC J17 "peanut head", PLOS ONE stranded killer whales, PLOS ONE / UC Davis SRKW skin lesions):
   - **"Peanut head":** a dent behind the blowhole as fat is lost, so the skull outline shows.
   - **Thinner body.**
   - **Skin lesions:** grey patches, grey ring "targets" and pinpoint black specks.
   - **Lethargy:** slower, resting/logging at the surface.
   - Implement with TSL on the existing materials (the orca mesh has **no UVs**, so use object-space procedural noise):
     - `colorNode` mixes grey patches, rings and black specks in by a `sickness` uniform;
     - `positionNode` pushes vertices in along the normal in a head-neck region for the peanut head (verify in `node_modules` that `positionNode` composes with skinning);
     - optional width scale for thinness.
   - **Progression:** starts at 0 on Day 1 and grows with **each zombie it eats** (plus a small per-phase floor); it is clearly sick by Night 3 and dying at the end.
   - Its blow is a pale mist that gets wheezier/quieter; it turns red **only at the very end**.
   - The calf in the canoe stays healthy. It already has its own cloned materials: keep that.
5. **It comes onto the road / over the bank, and its fin shows over the land** (screenshot: the fin over the bank). Re-check:
   - `inWaterX` while cruising;
   - the grab's beaching: keep it, but it must look intentional, and the cruising fin must NEVER be over the land;
   - log the min body x over a whole night in the browser.
6. **When it kills a zombie, the zombie must be IN ITS MOUTH and dragged into the water.**
   - Kartik saw zombies "live on the ground" when it kills.
   - Check every kill path: grab bite range misses; the ending's `sweep` uses `takeByFish` (slides and sinks on the bank, which looks like dying on the ground); `drown`.
   - Every zombie the creature kills must be visibly carried in its jaws into the water.
   - Sweep victims: also grabbed/carried, or knocked into the water with a visible splash.
7. **An invisible wall near the right river bank** (Night 2 suburbs screenshot) stops him from getting close to the water, so zombies never come near the creature.
   - Find it: walk x toward `EDGE_X` along every night zone and log the colliders hit (`world.colliders`, gate boxes, crate/props with `collide: true`: the suburb/city helpers at suburbs.ts:43,53 and city.ts:55,65 set `collide: true`; the strip blocker for the river starts at `EDGE_X`).
   - Let the player reach the water's edge on every bank.

**Waves (all nights)**

8. **The barricade is far too close to the wave start.** He can see the barricade from the crate. **Lengthen every wave zone** so you can't see the barricade from the crate (fog: night far about 55 m, so make the zones 90 m or more), and keep the overall strip long enough (extend the area's `endZ`/`safeZ` if needed).
9. **Zombies must keep coming at random times through each wave** until its quota is killed. Standing still must not mean "no one comes": waves are time-driven (spawns every few seconds near the player, from ahead, sides and behind), not only triggered by walking past points. Keep a few ambushes (lying "corpses", cover) as surprises on top.
10. **Each wave stronger than the last**: more zombies, slightly faster, shorter gaps.
11. **The HUD/objective must tell the player what to do**: "Follow the river. Keep moving." and a hint when the barricade is down, "Keep going downstream". Never leave the player wondering why nothing happens.

**Difficulty / balance**

12. **Far too much ammo; arrows alone kill everything; he never needs the guns or the creature.** Cut `CRATE` amounts and `AFTER_DEATH`. Put ammo and arrow pickups along the river edge. Tune per difficulty.
13. **The torch stun lasts too long** (`STUN = { exposure: 0.4, seconds: 2.5 }` in `zombies/brain.ts:40`). Make it about 0.8–1.0 s on Normal, with longer exposure needed.
14. **Difficulty menu** (see answers).

**The ending (Night 3 lake)**

15. **The creature attacks too early**: zombies get eaten far from you and Mom. In the last stand it must only strike zombies **within about 8–10 m of the player or Mom**, so the fight happens around you. Make it a beautiful scene of fighting together.
16. **When it strands, it must come SWIMMING visibly** (fin, wake) from wherever it is to the shore and slide up. Today it approaches underwater, so it "appears out of nowhere" (`orca-strand.ts` `STRAND.approach`).
17. **The hand moment is broken:**
    - The **gun viewmodel stays in view** (screenshot): hide all weapon viewmodels and the HUD during the farewell.
    - Turn the torch off or soften it (it blows the creature out to white).
    - Make it a **cinematic**:
      - Mom **kneels right next to you**;
      - **your first-person hand and Mom's hand on its side**;
      - it **slowly lifts its head a little and turns its eye toward you**;
      - then the camera **pulls out into a slow circular orbit** around you, Mom and the dying creature (your third-person body is needed here);
      - then the last fish pack;
      - then it is still.
18. **Its reply to Mom's song needs a real sound**: find a CC0 orca/whale call (grounded-research: OpenGameArt or freesound CC0 only). Keep the soft cry as a fallback.
19. **Dawn after the farewell looks wrong, and the FPS drops badly.**
    - He wants a real sunrise: **a yellow/warm sun, the sky turning blue, moonlight (white) giving way to sunlight (yellow)**.
    - Find the FPS drop: profile the dawn step. `applyLighting` every 0.25 s repaints the sky dome vertex colours in `engine/sky.ts paintSkyDome`; also the lake reflector, the fog and the post bloom.
20. **Canoe ride sounds like a motorboat.**
    - Replace it with **paddle strokes in the water** synced to Mom's Row cycle (2.417 s, two strokes per cycle), plus soft water and birds (CC0, researched).
    - Check whether the drone is `sounds.dawn` or `sounds.water`.
21. **Add a small conversation with Mom during the ride** (player-paced captions at moments, e.g. "where do we go now", the zombies, Dras, her guilt, the calf). Lines are in the voice style, no em dashes.
22. **Trees float in the air** at the river banks in the canoe scene (screenshot). Place every tree, bush and rock on the terrain height (`canoe-scene.ts` terrain function), and test the min height under every instance.
23. **"Mom stops rowing. She has seen it too." while she is still rowing** (screenshot). Switch her to Sit (and stop the paddle) **when that page shows** or the calf surfaces, not at `rowAmount < 0.5`.
24. **The ending shot:**
    - Zoom out from the canoe showing **Mom and Kartik (his new model) sitting in it**;
    - the boat keeps gliding down the sunrise river, the camera rises and falls behind;
    - a calm ending, then the credits.
25. **A black screen after the game ends** (screenshot: "Kartik's Dreams / Start" on black).
    - Root cause found: `session.ts finish()` does `overlay.fade(true).then(leave)`, and `goHome` → `startHome` never calls `overlay.fade(false)`.
    - Fix: fade in at home start. Check the bedroom renders and nothing is left over from the canoe scene.
26. **Mom's face "firing like a firecracker"** at dawn (screenshot 32): a blown-out glow at her face and eyes. See section 3.
27. **"You are putting no realism at all"**: Track B (Kartik chose "Sharp stylised").

## 3. Confirmed root causes (measured or reproduced this session; do not re-investigate)

| # | Complaint | Root cause (evidence) |
|---|---|---|
| 3 | Creature white | `tintSick` sets every material to `white.lerp(SICK.tint, k)`. In Night 3 all three materials read `c0b3b0` (browser, `orca-black`, `orca-white`, `orca-grey`). Mid-leap it reads as a pink-beige shark (screenshot). |
| 5 | Fin over the bank | Natural banks (`banks.ts bankProfile('natural')`) keep mud above the water out to x≈6.75 (y −1 is reached between x 6 and 7), while the cruise lane is x∈[5.5, 8.5] (`cruiseTargetX`: EDGE_X + 4 ± 1.5). The body and fin cruise over the mud. |
| 6 | Zombie "lives on the ground" when eaten | The ending's sweep calls `takeByFish`: state `taken`, clip `Hit` (a knock-down), slides +x at 2 m/s while sinking 1.2 m/s from y 0, so it sinks into the ground on the bank. A grab whose bite misses (`biteRange` 2.5) returns empty-mouthed and the zombie lives on. A held zombie's pose in the jaws was never screenshotted: Task A3 step 1 checks it. |
| 7 | Invisible wall at the right bank (Night 2) | The river blocker (`world.ts stripBlockers`) starts at x = EDGE_X = 3, the top of the natural slope; the visible mud runs on to x≈6.75. The player stops at x 2.7 looking at 4 m of walkable-looking bank. Task A4 step 1 confirms by walking +x in Night 2 and logging the box hit. |
| 8–10 | Barricade right in front of the crate, nobody comes | Each zone is 32 m (wave z −148 → gate −180) with the crate at z−2; night fog ends at 45–55 m, so the barricade is in view from the crate. Spawns only fire when the player walks past ambush trigger z (`stepWaves`), so standing still spawns nobody. |
| 12 | Arrows kill everything | One arrow hit kills (`bow.ts resolveHit` → `horde.kill`), and the arrow sticks where the zombie stood and is picked back up (`RECOVER_RADIUS`), so arrows are effectively infinite. Crates add 4 arrows, a battery and ammo for every gun. |
| 13 | Stun too long | `STUN = { exposure: 0.4, seconds: 2.5 }` (`zombies/brain.ts:40`). |
| 15 | Creature eats them far away in the last stand | `WAVE.orca.reach` 7 is measured from the bank edge, not from you; zombies spawn 34 m upstream at x 2..−4, all inside reach, so it strikes as soon as they appear. |
| 16 | Appears out of nowhere | `STRAND.approach` 1.6 s, travelling underwater (`launchY` = rest.y − 2.8) from wherever it was, then leaps. |
| 17 | Gun in view, no hands, no Mom | The farewell keeps gameplay ticking: `controls.switchWeapons` sets the current viewmodel visible every frame; the HUD has no cinematic class here; Mom walks to a spot 0.9 m from the camera and is off-screen; there are no hand meshes at all (screenshot this session: bow in view, beige creature, HUD up). |
| 19 | Dawn "FPS so low I see each frame" | Not a performance drop: GPU-waited frames during the dawn are median 2.7 ms / p95 4.6 ms. The light is repainted only every 0.25 s (`DAWN.step`), so the brightening steps at 4 Hz like a slideshow. `applyLighting` costs 7 µs: do not re-profile it. The dawn preset itself is grey (`LIGHTING.dawn`: sky 0x2a3036/0x625d5a, disc 0x8a837c soft 0.9), not a sunrise. |
| 20 | Canoe "motorboat" | `sounds.dawn` (`dawnSamples`: a C-major pad on a 65 Hz fundamental with detuned beating copies) drones under `sounds.water`. |
| 22 | Floating trees in the canoe scene | Items sit on the analytic `terrainY` but the terrain mesh is a 2.5 m grid of flat triangles; on the concave bank top the mesh lies below the curve. Measured over 193k placements: gap up to 0.54 m, 503 placements over 0.2 m, worst at d≈12 m from the river centre (where trees cluster). |
| 23 | "Mom stops rowing" but rowing goes on | She does switch to Sit at t≈67.75 s (screenshot at 72.6 s: sitting, paddle across her lap), but `travelled()` keeps the canoe at 2.4 m/s through the closing pages and the drone keeps playing: the boat never slows. |
| 25 | Black screen after the credits | `session.finish` fades to black then `leave()`; `startHome` never fades back in. |
| 26 | Mom's face "firing like a firecracker" at dawn (new, screenshot 32) | `ending-scene.ts update()` hangs the lantern's PointLight in world space at `(mom.x + 0.5, 1.3, mom.z)`: face height, 0.5 m from her face, intensity 5, distance 28; with no tone mapping and bloom threshold 0.7 her face and eyes blow out. The lantern mesh rides her wrist in the pack slot, so the light and the lamp are not even in the same place. |
| 27 | "No realism at all" (new) | 540-row render scaled up, no anti-aliasing, no tone mapping (raw sRGB clipping), no ambient occlusion, a two-colour painted sky dome, Kenney's flat low-poly nature kit, no wind, lights placed by eye. Track B. |
| 2 | Phone missing | `intro.ts` goodbye plays `Idle_Gun_Pointing` with nothing in her hand. |
| 1 | Baseball throw | `intro.ts throwAction` plays the retargeted UAL2 `OverhandThrow` (`Throw`, release 0.8 s). |

## 4. Rulings (scope and design decisions taken while planning)

- Ruling: first-person arms holding every weapon is in no complaint and no answer. It is Task B5, the last task, optional, never blocks launch. Only the farewell's reaching hand (Task A10) is required.
- Ruling: Mom's bag in the last stand (`armForLastStand`, ammo to the brim) stays: it is a story beat ("Take this"). It scales by difficulty (Task A6): full on Story, half on Normal, a third on Hard.
- Ruling: "Watch the ending again" plays the canoe ride and credits instead of text-only `REPLAY_PAGES` (Task A11), and its wording joins the rename (Task A2).
- Ruling: the canoe ride keeps running behind its dialogue pages (it is ambient; nothing can happen to you), so the conversation never freezes the river.
- Ruling: difficulty lives in `Settings` (shared, saved, changeable from the pause menu) and is asked once when a new run starts. Old settings without it default to Normal.
- Ruling: zombies take two body hits on Normal and Hard (a head hit always kills; the shotgun's close blast always kills), one on Story. This, scarce ammo, no recovering an arrow that killed, and short stuns are together what makes the creature and the guns matter.
- Ruling: one sky system. `SkyMesh` (r186, verified in `node_modules/three/examples/jsm/objects/SkyMesh.js`: `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, `sunPosition`, `showSunDisc`, cloud uniforms) for dusk, day, dawn and sunrise; at night the sun is below the horizon, so a dark star dome plus the moon disc (kept from today) take over, blended by sun elevation. Every night preset is checked "never bright" by screenshot.

