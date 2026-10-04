# Plan 9: the last iteration ("this should be picture perfect, then we launch")

> **For agentic workers:** REQUIRED SUB-SKILL: **`superpowers:subagent-driven-development`** (Kartik's choice, 2026-10-04: "use subagent driven development, it works better"), together with `grounded-research`, `superpowers:executing-plans` discipline (ledger, TDD, verification) and the repo game skill `webgpu-threejs-tsl`. Implementers and reviewers are Sonnet subagents (`model: "sonnet"`, Kartik's standing rule; it overrides the skill's "more capable model" escalation). Steps use checkbox (`- [ ]`) syntax.
> - Use `grounded-research` for any asset, sound, API or version; use the repo skill `webgpu-threejs-tsl` for every three.js / TSL change.
> - Subagents run on Sonnet only (`model: "sonnet"`). Blender and asset-building tasks go to Sonnet agents with exact briefs; the controller reviews their output by eye.
> - Work in a git worktree `.claude/worktrees/plan-9` (branch `plan-9`) with its own Vite port (5180). :5173 is Kartik's: never touch it.
> - Commit per task (upgrades in their own commits so a regression can be bisected). When everything is verified, fast-forward local `main`. NEVER push.

**Goal:** fix every one of Kartik's play-test complaints (sections 2 and 3) and ship the graphics and animation upgrades he chose, so the game can launch with no visible issue.

**Architecture:** Two tracks. **Track A** (Tasks A1–A17) is launch acceptance: every numbered complaint plus his answers (Dras rename and naming tape, difficulty, Kartik's model, the farewell cinematic, the canoe ending). **Track B** (Tasks B1–B4) is the rest of the look-and-feel upgrade (the physical sky everywhere with moon and sun shadows, Quaternius nature models with wind, splash and mist particles, first-person arms on the weapons). The render pipeline (full resolution, AgX, GTAO, SMAA) is Task A13 (see the rulings). If time runs out, A done and B partial is shippable; the reverse is not. Each task ends with a player's-eye Chrome check (section 0), not only unit tests.

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
| 6b | Held zombie looks dead on the ground (confirmed by screenshot this session) | The model has no mouth: the zombie is posed flat under the snout tip at ground level (`GRAB.jawAhead` 3.5 = the nose tip, `jawBelow` 0.1), so it reads as a body lying on the bank in front of a white blob. |
| 7b | Night 2 wall (confirmed this session) | Walking +x at z −150 stops at x 2.7 against `{minX 3, maxX 33, minZ −417, maxZ 16}` (the river blocker); a 4 m dark mud strip lies between the player and the water (screenshot). |
| 28 | Flashlight at point blank blows the whole screen white (found this session) | A zombie 0.5 m away in the 80 cd beam, no tone mapping, bloom threshold 0.7: the frame went white-green behind the "You are hurt" page. |
| 29 | "Don't tell people how many zombies are left" (Kartik, this session) | `hud.ts waveText` shows `Wave 2/3 · 5 left`. |
| 30 | "Still white, where are its small eyes, it looks like a turd" (Kartik, this session, screenshot 33) | Besides the tint bug: `tools/blender/orca.py` builds a 5-bone blob with no eyeballs (the eye is only a white patch), no mouth, a male-sized straight dorsal fin and soft round proportions. Task A7 rebuilds it to real orca anatomy, with every render checked against reference photos. |
| 2 | Phone missing | `intro.ts` goodbye plays `Idle_Gun_Pointing` with nothing in her hand. |
| 1 | Baseball throw | `intro.ts throwAction` plays the retargeted UAL2 `OverhandThrow` (`Throw`, release 0.8 s). |

## 4. Rulings (scope and design decisions taken while planning)

- Ruling: first-person arms holding every weapon is in no complaint and no answer. It is Task B5, the last task, optional, never blocks launch. Only the farewell's reaching hand (Task A10) is required.
- Ruling: Mom's bag in the last stand (`armForLastStand`, ammo to the brim) stays: it is a story beat ("Take this"). It scales by difficulty (Task A6): full on Story, half on Normal, a third on Hard.
- Ruling: "Watch the ending again" plays the canoe ride and credits instead of text-only `REPLAY_PAGES` (Task A11), and its wording joins the rename (Task A2).
- Ruling: the canoe ride keeps running behind its dialogue pages (it is ambient; nothing can happen to you), so the conversation never freezes the river.
- Ruling: difficulty lives in `Settings` (shared, saved, changeable from the pause menu) and is asked once when a new run starts. Old settings without it default to Normal.
- Ruling: zombies take two body hits on Normal and Hard (a head hit always kills; the shotgun's close blast always kills), one on Story. This, scarce ammo, no recovering an arrow that killed, and short stuns are together what makes the creature and the guns matter.
- Ruling: the render pipeline upgrade (tone mapping, AA, full resolution, GTAO) moves from Track B into Track A as Task A13: the sunrise (`SkyMesh` outputs HDR), Mom's lantern glare (#26) and the flashlight blowout (#28) all need tone mapping, and "no realism" (#27) is a launch complaint.
- Ruling: every task runs through a Sonnet implementer (subagent-driven development, Kartik's choice). For the asset tasks (A7 Dras, A10 Kartik and Mom's clips) the controller additionally looks at every render the implementer produces and sends it back with concrete fixes until it reads right; A7 (the centrepiece, rejected twice) gets up to five fix rounds before the controller rules.
- Ruling: Dras is female (Mom already says "Here, girl"): a female orca's dorsal fin is shorter (about 0.9 m on a 7 m body) and curved back (falcate), unlike the 1.45 m straight fin today.
- Ruling: the HUD shows the wave number only ("Wave 2 of 3"), never how many are left (Kartik, #29).
- Ruling: one sky system. `SkyMesh` (r186, verified in `node_modules/three/examples/jsm/objects/SkyMesh.js`: `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, `sunPosition`, `showSunDisc`, cloud uniforms) for dusk, day, dawn and sunrise; at night the sun is below the horizon, so a dark star dome plus the moon disc (kept from today) take over, blended by sun elevation. Every night preset is checked "never bright" by screenshot.


---

## 5. Tasks

Execution order is the order below. Every task: read its section, write the failing test first where the logic is pure, implement, `pnpm vitest run <files>` green, the **player's-eye Chrome check** (section 0) with screenshots looked at, `pnpm run check` green, commit, append a ledger line. A Chrome check that shows anything a player would call broken means the task is not done.

Ledger: `.claude/worktrees/plan-9/.superpowers/sdd/plan-9/progress.md`, first line `# SDD ledger — plan: docs/superpowers/plans/2026-10-07-plan-9-flawless.md`.

### Task A0: Workspace

- [ ] `git worktree add .claude/worktrees/plan-9 -b plan-9 main` (the session then works inside it; `EnterWorktree` with `path`).
- [ ] `pnpm install`; `pnpm run check` → expect 402 tests green.
- [ ] Start a dev server on port 5180 in the background: `pnpm exec vite --port 5180 --strictPort`. Never use :5173.
- [ ] Create the ledger file with its first line.

### Task A1: Quick fixes (home fade-in, throw revert, wave text, canoe ground, Mom's lantern)

**Files:**
- Modify: `src/main.ts:60-71` (goHome), `src/dreams/follow-the-river/intro.ts:67,218`, `src/dreams/follow-the-river/hud.ts:41-44`, `src/dreams/follow-the-river/hud.test.ts:24-25`, `src/dreams/follow-the-river/canoe-scene.ts` (export `meshY`, use it in `scatter` and `makeFlowers`), `src/dreams/follow-the-river/canoe-ride.test.ts` (new tests), `src/dreams/follow-the-river/ending-scene.ts:73-96` (lantern).

**Interfaces:**
- Produces: `meshY(x: number, z: number): number` in `canoe-scene.ts` (the exact height of the terrain mesh, same triangulation as `makeTerrain`); `waveText(wave: number, waves: number): string`.

- [ ] **Step 1: failing tests.** In `hud.test.ts` replace the two `waveText` lines:
```ts
    expect(waveText(2, 3)).toBe('Wave 2 of 3');
    expect(waveText(0, 3)).toBe('');
```
In `canoe-ride.test.ts` add:
```ts
import { meshY, rng, terrainY, pathX, RIVER_HALF } from './canoe-scene';

describe('ground under the scenery', () => {
  it('meshY equals terrainY on every grid vertex', () => {
    for (const [x, z] of [[-125, 70], [0, 0], [12.5, -100], [-2.5, -297.5]] as const)
      expect(meshY(x, z)).toBeCloseTo(terrainY(x, z), 5);
  });
  it('is the flat triangle between vertices (never the curve above it)', () => {
    const r = rng(5);
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
      const z = 70 - r() * 400;
      const x = pathX(z) + (r() < 0.5 ? -1 : 1) * (RIVER_HALF + 1.5 + r() * 80);
      worst = Math.max(worst, Math.abs(meshY(x, z) - terrainY(x, z)));
    }
    expect(worst).toBeGreaterThan(0.2); // proves the old placement could float
    expect(worst).toBeLessThan(0.8);
  });
});
```
Run `pnpm vitest run src/dreams/follow-the-river/hud.test.ts src/dreams/follow-the-river/canoe-ride.test.ts` → FAIL (`waveText` signature, `meshY` not exported).

- [ ] **Step 2: implement.**
  - `hud.ts`: `export function waveText(wave: number, waves: number): string { return wave > 0 ? \`Wave ${wave} of ${waves}\` : ''; }` and update its one caller (`renderHud`: `waveText(s.wave, s.waves)`); keep `HudState.left` out (delete the field and its writer in `play.ts tickView`, `hudState.left = ...`).
  - `canoe-scene.ts`: export the grid constants used by `makeTerrain` (`TERRAIN`, `zNear` passed in) and add:
```ts
/** Pure: the terrain mesh's own height at (x, z): the flat triangle of the grid cell, exactly as drawn. */
export function meshY(x: number, z: number, zNear: number = TERRAIN.behind): number {
  const { cell, halfWidth } = TERRAIN;
  const k = Math.floor((x + halfWidth) / cell);
  const r = Math.floor((zNear - z) / cell);
  const x0 = -halfWidth + k * cell;
  const z0 = zNear - r * cell;
  const u = (x - x0) / cell;
  const v = (z0 - z) / cell;
  const h00 = terrainY(x0, z0);
  const h10 = terrainY(x0 + cell, z0);
  const h01 = terrainY(x0, z0 - cell);
  const h11 = terrainY(x0 + cell, z0 - cell);
  // makeTerrain's index order: (i, i+cols, i+1) and (i+1, i+cols, i+cols+1).
  return u + v <= 1
    ? h00 + (h10 - h00) * u + (h01 - h00) * v
    : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
```
  In `scatter`, place items at `meshY(x, z) - SINK` where `const SINK = 0.15;` (named knob: trunks bite into the ground), and keep the `minY` filter on `terrainY`. In `makeFlowers` use `meshY(x, z) + 0.13`.
  - `main.ts goHome`: after `const home = await startHome(...)` add `void overlay.fade(false); // finish() left the screen black` (inside the `try`, before the dream callback runs; the boot path's fader is already clear so this is a no-op there).
  - `intro.ts`: `const THROW_DELAY = 0.7; // Mom's wind-up before the pack leaves her hand` and `mom.play('Interact', true);` (exactly as before `851f1b8`).
  - `ending-scene.ts`: the lantern light lives inside the lantern. Replace the world-space placement with the lamp's own world position:
```ts
const lamp = new THREE.Vector3();
...
update(dt) {
  actor.update(dt);
  mom.update(dt);
  if (lakeZ !== null) mom.group.position.y = shoreY(mom.group.position.z - lakeZ);
  if (held) {
    mom.pack.getWorldPosition(lamp); // the lantern mesh rides her right hand
    held.position.set(lamp.x, lamp.y + LANTERN_GLOW_UP, lamp.z);
  }
},
```
  with `const LANTERN_GLOW_UP = 0.05;` and retune `MOM_LANTERN = { intensity: 2, distance: 14, height: 1.3 }` (`height` stays for `place()`); the lantern mesh colour becomes `0xc07a30` (dimmer, so bloom only haloes it). Final values are retuned under AgX in Task A13.
- [ ] **Step 3:** run the two test files → PASS. `pnpm run check` → green.
- [ ] **Step 4: Chrome check.**
  - Canoe ride via the fake `ctx` (section 0): step to t = 20, 40, 60 s; at each, look left and right (`camera.rotation.y ±1.2`), screenshot: no tree, bush or rock base hangs above the ground; zoom the bank line.
  - `?phase=night3`, run the ending to the dawn (section 0 recipe: teleport to (−1, −378), skip pages, step the fight, teleport to the farewell spots, E): screenshot Mom facing you at "Let's go home": no glowing face or eyes; the lantern glows in her hand.
  - Quit to dreams from the pause menu and finish a run (the fake ctx `finish`), screenshot the home screen: the bedroom shows (not black).
  - Intro (`?phase=intro`): the throw is the old underarm `Interact` gesture.
- [ ] **Step 5: commit** `fix: home fades back in after the credits, the old throw, wave number only, canoe scenery on the ground, Mom's lantern light in the lantern`.

### Task A2: Words (Dras, Subject R-7, Kartik), the naming tape, flashbacks swapped

**Files:**
- Modify: `src/dreams/follow-the-river/tapes.ts`, `intro.ts` (INTRO_PAGES), `hints.ts`, `controls.ts:200-201` (prompt), `ending.ts` (ENDING_PAGES, REPLAY_PAGES), `ending-farewell.ts` (FAREWELL_PAGES), `canoe-ride.ts` (CLOSING_PAGES), `src/dreams/registry.ts` (intro, howToPlay), `flashback-scene.ts` (BUILDERS, tank naming beat), `flow.ts:33` (`throw them to the fish first` → `feed them to Dras first`).
- Test: `src/dreams/follow-the-river/tapes.test.ts` (extend), new `src/dreams/follow-the-river/words.test.ts`.

**Interfaces:**
- Produces: `BUILDERS` order `1: buildTank` (with the naming), `2: buildLab`, `3: buildSpillway`; `SHOTS[1]` is the tank shot, `SHOTS[2]` the lab shot (swap the two entries).

- [ ] **Step 1: failing test** `words.test.ts` (every on-screen string list in one place):
```ts
import { describe, expect, it } from 'vitest';
import { DREAMS } from '../registry';
import { FAREWELL_PAGES } from './ending-farewell';
import { ENDING_PAGES } from './ending';
import { HINTS } from './hints';
import { INTRO_PAGES } from './intro';
import { TAPES } from './tapes';
import { CLOSING_PAGES } from './canoe-ride';

const all = (): string[] => [
  ...Object.values(TAPES).flat(),
  ...Object.values(INTRO_PAGES).flat(),
  ...Object.values(HINTS).flat(),
  ...Object.values(ENDING_PAGES).flat(),
  ...Object.values(FAREWELL_PAGES).flat(),
  ...CLOSING_PAGES,
  ...DREAMS.flatMap((d) => [...d.intro, ...d.howToPlay]),
];

describe('on-screen words', () => {
  it('never call her "the orca" (only the lab line about the cell line may say orca)', () => {
    const bad = all().filter((t) => /orca/i.test(t) && !/orca cell line/i.test(t));
    expect(bad).toEqual([]);
  });
  it('call him Kartik, never "K"', () => {
    expect(all().filter((t) => /\bK\b(?!artik)/.test(t))).toEqual([]);
  });
  it('have no em dashes', () => {
    expect(all().filter((t) => t.includes('—'))).toEqual([]);
  });
  it('name Dras and Subject R-7 on the first tape', () => {
    const tape = TAPES[1]?.join(' ') ?? '';
    expect(tape).toMatch(/Subject R-7/);
    expect(tape).toMatch(/Dras/);
    expect(tape).toMatch(/fresh water|freshwater|river/);
  });
});
```
Run → FAIL.

- [ ] **Step 2: the text** (exact):
```ts
export const TAPES: Readonly<Record<number, readonly string[]>> = {
  1: [
    'The label says: "Day 12. For Kartik, when he is older."',
    '[Tape hiss. Water lapping against glass. Mom, close to the microphone.]',
    '"Day twelve. The board calls her Subject R-7. We grew her from an orca cell line and changed her, cell by cell, so she can live in fresh water."',
    '"She was made to clean the river. She eats what the factories leave in it, and the water comes out clear."',
    '"She comes to the glass when I sing. Every single time."',
    '"I am not calling her R-7. Her name is Dras."',
    '"Kartik, if you ever meet her, she is gentle. She is ours."',
  ],
  2: [
    'The label says: "Day 41. Kartik, don\'t watch this."',
    '[Tape hiss. Mom, tired, close to the microphone.]',
    '"Day forty-one. Dras eats everything we give her. She is growing faster than the model said she could."',
    '"Dr. Rao says the growth enzyme is stable. It isn\'t. Two of the test mice got out last night. They bit Arun."',
    '"He went home sick. Nobody has heard from him since."',
    '"The director buried the reports. I took the samples home, Kartik. I\'m scared of what I\'ve done, and of being found out."',
    '"If you\'re watching this, sweetheart… I\'m sorry. I only wanted to make something that could save the river."',
  ],
  3: [
    'The label says: "Last tape."',
    "[Wind outside. Mom's voice is steady, but quiet.]",
    '"It started at the lab by the dam, sweetheart. It got out, and it is spreading."',
    '"I let Dras go into the river, so they couldn\'t destroy her."',
    '"She knows my voice. She will protect you, Kartik."',
    '"But every one of them she takes, she takes the sickness too. It\'s in her blood now. I don\'t know how long she can last."',
    '"If you\'re watching this, you followed the river."',
    "\"I'll wait for you at the lake below the dam. That's where it started. I'm going to fix what I can.\"",
  ],
};
```
  - `INTRO_PAGES.throw`: `'Mom: "Here, Dras. Here, girl."'`, `'Something enormous moves under the water. Black and white. She takes the fish and is gone.'`; `goodbye`: `'Mom: "She knows me. She will know you."'`, `'Mom: "Listen to me. Whatever happens, run. Always follow the river."'`, `'Mom: "Feed her, and she will keep you safe at night. Go!"'`, last page unchanged.
  - `HINTS.fish`: `"Stand at the water's edge and press E to throw a fish pack in."`, `'Every pack you feed Dras makes her hunt harder for you at night.'`; `HINTS.night` last line: `'Stay close to the water. E at the edge feeds Dras: every fish pack makes her hunt harder.'`; `HINTS.night` barricade line: `'Downstream, a barricade holds you at each wave. They keep coming until the wave is dead; then it falls.'`.
  - `controls.ts` prompt: `isNight(c.run.phase) ? 'E: feed Dras' : 'E: throw a fish pack'`.
  - `ENDING_PAGES.mom[2]`: `'Mom: "They\'re coming, all of them. Take this, and stay by the water. Dras will fight with us."'`; `ENDING_PAGES.credits`: `["Kartik's Dreams - Follow the River", 'A dream by Kartik', 'Art: Kenney and Quaternius (CC0)', 'Sound: OpenGameArt and Freesound contributors (CC0), U.S. National Park Service recordings (public domain)', 'Made with three.js']`.
  - `REPLAY_PAGES` is deleted in Task A16 (the replay plays the ride); until then: `'Dras lies on the pebbles below the dam, where she held them back.'`, `'Mom rows you down the river into the green. Something small swims beside the canoe.'`.
  - `FAREWELL_PAGES`: stranded `['Mom: "No. No, no, no..."', 'Mom: "She was eating the sickness for us. Every one she took, she took the sickness too."', 'Mom: "She held on for us. She held on for you."']`; song second line `'She hums the song from the lab, the one Dras learned through the glass.'`; answer `['Dras answers her. Once, softly.']`; hand `['Her skin is cold and rough under your hand.', 'Mom puts her hand next to yours. Neither of you says anything.']`; pack `['You set your last fish pack on the water beside her.', 'She breathes out once, long and slow. Then she is still.']` (Task A15 adds the head-lift line).
  - `CLOSING_PAGES[1]`: `'Mom: "Look. She wasn\'t alone."'`.
  - `registry.ts` howToPlay: `"Throw fish packs into the river (E at the water's edge). The more you feed Dras, the harder she hunts for you at night."` and the night line `'By night: zombies keep coming in waves. Clear each wave and the barricade falls. Follow the river downstream.'`; add `'1 to 4: switch weapons. R: put in a spare battery.'`.
- [ ] **Step 3: flashbacks.** In `flashback-scene.ts` swap `SHOTS[1]`/`SHOTS[2]` values and `BUILDERS` to `{ 1: buildTank, 2: buildLab, 3: buildSpillway }`; in `buildTank` the young Dras swims to the glass and holds still facing Mom for the naming (extend `tankSwim` with a `hold` window: between `TANK_SWIM.holdFrom` 18 s and `holdTo` 30 s she stays at x 0, nose to the glass, yaw π; pure, add a test in `flashback.test.ts`: `tankSwim(24, out).x === 0` and yaw π). Mom plays `Idle_Neutral` and turns her head to the glass (no new clip needed here).
- [ ] **Step 4:** tests → PASS (also update `tapes.test.ts` / `flashback.test.ts` expectations that pinned the old order). `pnpm run check`.
- [ ] **Step 5: Chrome check:** `?phase=day1`, walk into shack s3 (−16, −52), take the tape: screenshot the tank flashback at page 3 ("Day twelve...") and page 6 ("Her name is Dras"); Dras at the glass. Day 2 tape: the lab. Night prompt at the edge reads "E: feed Dras". The intro page reads "Here, Dras".
- [ ] **Step 6: commit** `feat: she is Dras (Subject R-7), Kartik by name, the naming tape`.

### Task A3: Cutscene mode (no weapons, no HUD, no input while a cinematic plays)

**Files:**
- Modify: `src/engine/player.ts` (input switch), `src/dreams/types.ts` (DreamContext), `src/session.ts` (expose it), `src/dreams/follow-the-river/run.ts` (`Run.cutscene`), `chapter.ts` (`newRun`, DEV `window.kdRun`), `controls.ts` (`switchWeapons`, `trigger`, `use`), `play.ts` (`tick`), `hud.ts` + `src/style.css` (`.hud.hidden`).
- Test: `src/engine/movement.test.ts` is pure; add `src/dreams/follow-the-river/controls.test.ts` for the pure helper below.

**Interfaces:**
- Produces: `Player.setInputEnabled(on: boolean): void` (off: no movement, no mouse look, no jump; on: as now); `DreamContext.cinematic(on: boolean): void` (session: input off/on, cursor hidden, pause menu still opens on Esc); `Run.cutscene: boolean`; `viewVisible(weapon, current, owned, cutscene): boolean` in `controls.ts`.
- Consumed by: Tasks A9, A15, A16.

- [ ] **Step 1: failing test** `controls.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { viewVisible } from './controls';

describe('viewmodels', () => {
  it('shows only the weapon in hand, and nothing during a cutscene', () => {
    expect(viewVisible('bow', 'bow', ['pistol'], false)).toBe(true);
    expect(viewVisible('pistol', 'bow', ['pistol'], false)).toBe(false);
    expect(viewVisible('bow', 'bow', ['pistol'], true)).toBe(false);
    expect(viewVisible('pistol', 'pistol', [], false)).toBe(false);
  });
});
```
- [ ] **Step 2: implement.**
  - `controls.ts`: `export const viewVisible = (w: Weapon, current: Weapon, guns: readonly GunKind[], cutscene: boolean): boolean => !cutscene && w === current && owns(guns, w);` used in `switchWeapons`; `tick()` returns right after `switchWeapons` when `c.run.cutscene` (no F, R, fire, E).
  - `player.ts`: `let inputOn = true;` `setInputEnabled(on) { inputOn = on; controls.enabled = on; air.speed = 0; }` (verify `Controls.enabled` gates `PointerLockControls` mouse handling in `node_modules/three/examples/jsm/controls/PointerLockControls.js`; if it does not, skip `onMouseMove` by wrapping: keep the lock but restore the camera quaternion after each event while off); `update()` returns early when `!inputOn` (still runs `fall`, so a jump lands).
  - `session.ts` context: `cinematic: (on) => { gate.player.setInputEnabled(!on); }`.
  - `run.ts`: `cutscene: boolean` (`newRun`: false; `beginPhase` sets false and calls `ctx.cinematic(false)`).
  - `hud.ts`: `Hud.setHidden(hidden: boolean)` toggling class `hidden` (CSS `.hud.hidden { display: none; }`); `play.ts tickView` calls `sys.hud.setHidden(run.cutscene)` only when it changes.
  - `play.ts tick`: while `run.cutscene`, skip `p.controls.update` input effects (done in controls) and force `sys.flashlight.on = false` once on entry.
  - DEV: `chapter.ts` `if (import.meta.env.DEV) Object.assign(window, { kdRun: run });` next to `kdRiver`, and delete it in `teardown`.
- [ ] **Step 3:** test → PASS; `pnpm run check`.
- [ ] **Step 4: Chrome check:** `?phase=night1`, `kdRun.cutscene = true; kd...` (call the session's `cinematic(true)` via `kdRiver.ctx.cinematic(true)`): screenshot: no bow, no HUD, WASD and mouse do nothing; Esc opens the pause menu, Resume returns still in cutscene; `cutscene = false` + `cinematic(false)`: bow and HUD back, controls work. Die while `cutscene` is true (set health 0): the restart has the HUD and the bow.
- [ ] **Step 5: commit** `feat: cutscene mode hides weapons and HUD and holds the controls`.

### Task A4: Reach the water (natural banks), and Dras swims in water only

**Files:**
- Modify: `src/dreams/follow-the-river/banks.ts` (natural profile, `waterlineX`), `fish-parts.ts` (`cruiseTargetX`, `inWaterX` take the waterline), `fish.ts` (`cruise`, `stepRise`, `placed`), `fish-state.ts` (store `waterline`), `assemble.ts:55` (pass `waterlineX(area.bank)`), `orca-grab.ts` (`landX`, `crawlBack` edge use the waterline for the water side and EDGE_X for the land side), `ending.ts` (`waveSpot` unchanged), `fish.test.ts`, `banks.test.ts`, `world.test.ts`.

**Interfaces:**
- Produces: `waterlineX(kind: BankKind): number` (embankment: EDGE_X; natural: where the profile crosses WATER_Y); `createFish(..., bank: { ground, onBreach, waterline })`.

- [ ] **Step 1: the check first.** (Done this session: the blocker is `{minX 3}`; nothing else in the way.) If a re-check in Night 2 at z −150, −200, −260 and Night 3 at −150, −250 shows another box, rule and ledger it.
- [ ] **Step 2: failing tests.** `banks.test.ts`:
```ts
it('a natural bank is a short cut bank: water within a metre of where you stand', () => {
  expect(waterlineX('natural')).toBeGreaterThan(EDGE_X);
  expect(waterlineX('natural') - EDGE_X).toBeLessThan(0.6);
  expect(waterlineX('embankment')).toBe(EDGE_X);
  expect(bankY('natural', waterlineX('natural'))).toBeCloseTo(WATER_Y, 2);
});
```
`fish.test.ts`:
```ts
it('cruising never puts any of the body over the bank', () => {
  // 10 minutes of a player wandering the strip, 30 fps
  let worst = Infinity;
  const water = waterlineX('natural');
  for (let t = 0; t < 600; t += 1 / 30) {
    for (const yaw of [0, 0.3, -0.3, Math.PI, Math.PI / 2]) {
      const x = inWaterX(cruiseTargetX(water, t), yaw, water);
      worst = Math.min(worst, x - Math.abs(Math.sin(yaw)) * 3.5 - BODY_HALF_WIDTH - water);
    }
  }
  expect(worst).toBeGreaterThanOrEqual(0.5);
});
```
(export `BODY_HALF_WIDTH = 0.9` from `fish-parts.ts`, measured from the model in Task A7; update it there.)
- [ ] **Step 3: implement.** New natural profile (a short cut bank, water right below the grass edge):
```ts
return [
  { x: 3.0, y: 0, color: grass },
  { x: 3.12, y: -0.45, color: BANK.mud },
  { x: 3.32, y: -0.9, color: BANK.mud },
  { x: 3.6, y: -1.15, color: BANK.sand },
  { x: 8, y: BED_Y, color: BANK.sand },
];
```
`waterlineX` interpolates the profile for `WATER_Y` (pure, uses `bankProfile`). `cruiseTargetX(water, time) = water + LANE_OFFSET + Math.sin(time * 0.4) * WEAVE_X`; `inWaterX(x, yaw, water) = Math.max(x, water + BANK_MARGIN + BODY_HALF_WIDTH + Math.abs(Math.sin(yaw)) * HALF_LENGTH)`. Every caller passes the fish's `waterline` (city: EDGE_X, unchanged look). The grab still lands on the land (it is meant to leave the water), it starts from `water + GRAB.launchOut`.
- [ ] **Step 4:** tests PASS; `pnpm run check`.
- [ ] **Step 5: Chrome check:** Night 2 at z −150: walk +x: you stop at 2.7 with water 0.7 m away below the grass edge (screenshot down at the water: no dark mud strip). Watch Dras cruise for 60 s from the bank (screenshots every 10 s): fin always over water, never over mud; log `min(root.x) - waterline` over a whole wave, ≥ 0.9 when not grabbing. Night 1 (city) unchanged.
- [ ] **Step 6: commit** `fix: natural banks drop straight to the water, and Dras cruises in the water only`.

### Task A5: Difficulty (Story / Normal / Hard), short stuns, scarce supplies, two body hits

**Files:**
- Modify: `src/engine/settings.ts` (+test), `src/engine/menus.ts` (pause menu row), `src/dreams/types.ts` + `src/session.ts` (`difficulty()`, `setDifficulty()`), `src/dreams/follow-the-river/difficulty.ts` (+test), `zombies/brain.ts` (stun and damage from tuning, `hitKills`), `zombies/horde.ts` (`hurt`, wounds, damage), `zombies/look.ts` (`bodyHit` says head or body), `zombies/body.ts` (`wounds`), `bow.ts` (break arrows that kill), `gun.ts` (`horde.hurt`), `pickups.ts` (amounts × supplies, ammo box), `state.ts` (`topUp` × supplies), `ending.ts` (`armForLastStand` share), `hud.ts` (`hearts(health, damage)`), `play.ts` (HURT_HEALTH from damage), `index.ts` (ask on a new run).

**Interfaces:**
- Produces: `type Difficulty = 'story' | 'normal' | 'hard'` (engine/settings.ts); `Settings.difficulty: Difficulty`; `DreamContext.difficulty(): Difficulty`, `DreamContext.setDifficulty(d: Difficulty): void`; `DIFFICULTY: Record<Difficulty, DifficultyTuning>` and `nightTuning(chapter, difficulty)` (difficulty.ts); `Tuning` gains `stun: { exposure: number; seconds: number }`, `damage: number`, `bodyHits: number`; `Horde.hurt(id: number, head: boolean): boolean` (true = it died); `rayHit` returns `{ id, distance, head }`; `hitKills(wounds: number, head: boolean, bodyHits: number): boolean`.
- Consumed by: Task A6 (quota, interval, speed), Task A9 (bag share).

- [ ] **Step 1: failing tests.**
`src/engine/settings.test.ts`:
```ts
it('old settings without a difficulty load as Normal; bad values fall back', () => {
  expect(isSettings({ sensitivity: 1, volume: 0.5 })).toBe(true);
  expect(clampSettings({ sensitivity: 1, volume: 0.5 } as Settings).difficulty).toBe('normal');
  expect(clampSettings({ sensitivity: 1, volume: 0.5, difficulty: 'easy' as never }).difficulty).toBe('normal');
  expect(clampSettings({ sensitivity: 1, volume: 0.5, difficulty: 'hard' }).difficulty).toBe('hard');
});
```
`difficulty.test.ts`:
```ts
it('each step up is harder on every knob', () => {
  const [s, n, h] = (['story', 'normal', 'hard'] as const).map((d) => DIFFICULTY[d]);
  for (const [a, b] of [[s, n], [n, h]] as const) {
    expect(b.quota).toBeGreaterThan(a.quota);
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(b.interval).toBeLessThan(a.interval);
    expect(b.stun.seconds).toBeLessThan(a.stun.seconds);
    expect(b.stun.exposure).toBeGreaterThan(a.stun.exposure);
    expect(b.damage).toBeGreaterThanOrEqual(a.damage);
    expect(b.supplies).toBeLessThan(a.supplies);
  }
  expect(DIFFICULTY.normal.stun.seconds).toBeLessThanOrEqual(1);
});
it('night chase speed stays under the sprint on Hard', () => {
  for (const c of [1, 2, 3]) expect(nightTuning(c, 'hard').speed).toBeLessThan(SPRINT_SPEED - 0.3);
});
```
`zombies/brain.test.ts`:
```ts
it('a head hit always kills; body hits count up to bodyHits', () => {
  expect(hitKills(0, true, 2)).toBe(true);
  expect(hitKills(0, false, 2)).toBe(false);
  expect(hitKills(1, false, 2)).toBe(true);
  expect(hitKills(0, false, 1)).toBe(true);
});
it('the stun lasts the tuning's seconds', () => {
  const m = newMind(); m.state = 'chase';
  const t = { ...NIGHT_TUNING, stun: { exposure: 0.6, seconds: 0.9 }, damage: 34, bodyHits: 2 };
  const out = { intent: 'stand' as const, hit: false };
  for (let i = 0; i < 40; i++) think(m, { distance: 10, lit: true, heard: false }, t, 1 / 60, out);
  expect(m.state).toBe('stunned');
  expect(m.timer).toBeCloseTo(0.9, 1);
});
```
`hud.test.ts`: `expect(hearts(100, 50)).toBe('♥♥'); expect(hearts(50, 50)).toBe('♥♡'); expect(hearts(100, 25)).toBe('♥♥♥♥');`.
`pickups.test.ts`: crate on Normal gives a new pistol plus 6 bullets and 2 arrows and no battery; on Story 1.6×; on Hard 0.6× (rounded, at least 1 of each non-zero item).
Run → FAIL.

- [ ] **Step 2: the table** (`difficulty.ts`):
```ts
export interface DifficultyTuning {
  /** Zombies a wave needs killed, times the wave's quota. */
  quota: number;
  /** Added to every night's chase speed (m/s). */
  speed: number;
  /** Seconds between a wave's spawns, times the wave's own. */
  interval: number;
  /** Seconds of steady light to stun, and how long it holds. */
  stun: { exposure: number; seconds: number };
  /** One blow (health 100): 34 = three hits, 50 = two, 25 = four. */
  damage: number;
  /** Body hits that drop a zombie (a head hit always kills). */
  bodyHits: number;
  /** An arrow that killed can be picked up again (otherwise it breaks). */
  keepKillArrows: boolean;
  /** Crates, pickups and what a death gives back, times the base. */
  supplies: number;
  /** Share of Mom's bag in the last stand. */
  bag: number;
}

/** Tuning knobs. Normal is the game as meant: scarce, fast, short stuns. */
export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyTuning>> = {
  story: { quota: 0.6, speed: -0.5, interval: 1.4, stun: { exposure: 0.4, seconds: 1.6 }, damage: 25, bodyHits: 1, keepKillArrows: true, supplies: 1.6, bag: 1 },
  normal: { quota: 1, speed: 0, interval: 1, stun: { exposure: 0.6, seconds: 0.9 }, damage: 34, bodyHits: 2, keepKillArrows: false, supplies: 1, bag: 0.5 },
  hard: { quota: 1.4, speed: 0.3, interval: 0.75, stun: { exposure: 0.8, seconds: 0.6 }, damage: 50, bodyHits: 2, keepKillArrows: false, supplies: 0.6, bag: 0.34 },
};
```
`nightTuning(chapter, d)` caches by `${chapter}|${d}` and builds `{ ...NIGHT_TUNING, speed: NIGHT_DIFFICULTY[c].speed + DIFFICULTY[d].speed, stun, damage, bodyHits }`; `dayTuning(d)` = `DAY_TUNING` + the same stun/damage/bodyHits. Base supplies (Normal):
```ts
export const CRATE = { ammo: { pistol: 6, shotgun: 4, rifle: 15 }, arrows: 2, cells: 0, fishPacks: 1 };
export const AMMO_BOX = { pistol: 3, shotgun: 2, rifle: 8 }; // the 'ammo' pickup: for every gun you own (pistol bullets if none)
export const AFTER_DEATH = { battery: 60, cells: 1, arrows: 4, ammo: 6, shells: 3, rounds: 15, fishPacks: 1 };
PICKUP_GAIN: battery → cells 1, arrows 2, fishPack 1, gun → ammo 6
```
Scaling: `scaled(n, k) = n === 0 ? 0 : Math.max(1, Math.round(n * k))`.
- [ ] **Step 3: wiring.**
  - `brain.ts`: `lightUp` uses `tuning.stun`; `ATTACK.damage` removed, `t.hit` → `onHit(b.tuning.damage)`; `hitKills` exported.
  - `look.ts bodyHit` returns `{ distance, head } | null` (head sphere nearer wins); `horde.rayHit` passes `head`.
  - `horde.hurt(id, head)`: `b.wounds++`; if `hitKills(b.wounds - 1, head, b.tuning.bodyHits)` → `killMind`, return true; else a flinch: `mind.state = 'recover'; mind.timer = 0.35` (intent `stand`, plays the `Hit`-free `Idle` stagger), `b.heard = true`, return false. `spawnZombie` resets `wounds = 0`.
  - `bow.ts resolveHit`: `const died = horde.hurt(zombie.id, zombie.head)`; if `died && !keepKillArrows` the arrow breaks (`a.state = 'idle'`, mesh hidden) instead of sticking; `createBow(..., keepKillArrows: () => boolean)`.
  - `gun.ts shoot`: `horde.hurt(zombie.id, zombie.head)` per pellet hit.
  - `session.ts`: `difficulty: () => app.settings.difficulty`, `setDifficulty: (d) => app.saveSettings({ ...app.settings, difficulty: d })`.
  - `menus.ts showPauseMenu`: a row "Difficulty" with three buttons (`Story`, `Normal`, `Hard`), the current one `aria-pressed="true"` and class `on`; clicking calls `change({ difficulty })`. It takes effect from the next wave or phase start (say so under the row: `el('p', 'small', 'Takes effect from the next wave.')`).
  - `index.ts begin()`: for a new run (`coldDue` was true at start, or `startOver`) before anything plays: `const pick = await ctx.choose('How hard should the nights be?\nStory: more supplies, slower zombies, longer stuns.\nNormal: the game as meant.\nHard: little ammo, faster, bigger waves.', ['Story', 'Normal', 'Hard'], 1); ctx.setDifficulty(['story','normal','hard'][pick])`. (The cold open waits for it: it starts its clock on `begin`, check `coldopen.ts` and hold it until the choice closes.)
  - The chapter reads `ctx.difficulty()` at every `beginPhase` and wave start (so a pause-menu change applies next wave).
  - `ending.ts armForLastStand(run, share)`: `supplies[AMMO_OF[gun]] = Math.max(current, Math.round(SUPPLY_LIMITS[...] * share))`, arrows likewise, `cells + 1`.
- [ ] **Step 4:** tests PASS; `pnpm run check`.
- [ ] **Step 5: Chrome check (as a player, Normal):** Night 1 wave 1: light a zombie, count frames until it moves again (≈ 0.9 s); one body arrow staggers, the second drops it; a head arrow drops it; the arrow that killed is gone, a miss stuck in the ground can be picked up; crate gives pistol + 6. Pause menu shows the Difficulty row; switch to Hard: next wave zombies faster. New run (Start over): the difficulty question appears before the cold open.
- [ ] **Step 6: commit** `feat: Story, Normal and Hard; short stuns, scarce supplies, two body hits, arrows that kill break`.

### Task A6: Waves that keep coming, long zones, escalation, river-edge supplies, an objective line

**Files:**
- Modify: `src/dreams/follow-the-river/areas/types.ts` (WaveDef), `areas/city.ts`, `areas/suburbs.ts`, `areas/forest.ts` (zones, props past −400, safe props), `waves.ts` (+test), `play.ts` (`tickWaves`, spawning), `hud.ts` (objective line), `src/style.css`, `hints.ts` (`clear`), `phases.ts` (`run.pickups` adds the edge pickups), `areas/*.test.ts`, `world.test.ts`.

**Interfaces:**
- Produces:
```ts
export interface WaveDef {
  z: number;
  gateZ: number;
  /** Zombies to kill before the barricade falls (Normal; ambushes count toward it). */
  quota: number;
  /** Seconds between spawns, random in [min, max] (Normal). */
  every: readonly [number, number];
  /** Most of this wave alive at once. */
  cap: number;
  /** Added to the night's chase speed (m/s): each wave a little faster. */
  faster: number;
  ambushes: readonly AmbushDef[];
  crate: { x: number; gun?: GunKind };
}
export type WaveEvent = { kind: 'start'; wave: number } | { kind: 'spawn'; ambush: AmbushDef } | { kind: 'one' } | { kind: 'clear'; wave: number } | null;
export function stepWaves(w: WaveState, waves: readonly WaveDef[], z: number, alive: number, dt: number, d: Pick<DifficultyTuning, 'quota' | 'interval'>, rand: () => number): WaveEvent;
export function spawnSpot(player: { x: number; z: number }, zone: { startZ: number; gateZ: number; minX: number; maxX: number }, rand: () => number): { x: number; z: number };
export function edgePickups(area: AreaDef): PickupDef[];
export function objective(o: { night: boolean; fighting: boolean; wave: number; waves: number; ending: boolean; lake: boolean }): string;
```
`WaveState` gains `toSpawn` (all left to spawn, ambushes included) and `nextIn` (seconds to the next spawn).

- [ ] **Step 1: failing tests** (`waves.test.ts`, replacing the trigger-only tests):
```ts
const def: WaveDef = { z: -134, gateZ: -239, quota: 9, every: [4, 6], cap: 6, faster: 0,
  ambushes: [{ z: -134, count: 2, kind: 'street' }, { z: -200, count: 1, kind: 'behind' }], crate: { x: -1 } };
const N = { quota: 1, interval: 1 };

it('keeps spawning over time while you stand still, up to the cap, until the quota is out', () => {
  const w = newWaveState();
  const r = rng(3);
  expect(stepWaves(w, [def], -136, 0, 0.1, N, r)?.kind).toBe('start');
  let spawned = 0;
  let alive = 0;
  for (let t = 0; t < 300; t += 0.1) {
    const e = stepWaves(w, [def], -136, alive, 0.1, N, r); // the player never moves
    if (e?.kind === 'one') { spawned++; alive++; }
    if (e?.kind === 'spawn') { spawned += e.ambush.count; alive += e.ambush.count; }
    expect(alive).toBeLessThanOrEqual(def.cap + 2); // an ambush may burst over the cap
    if (alive > 0 && t % 7 < 0.1) alive--; // the player kills one now and then
  }
  // the ambush at z −200 stays reserved until you walk there
  expect(spawned).toBe(def.quota - 1);
});
it('clears only when everything is spawned and dead', () => { /* walk to −201, kill all → 'clear' */ });
it('scales the quota and the spawn gap by difficulty', () => { /* Hard: 13 zombies, gaps × 0.75 */ });
it('every zone is long: the barricade is at least 90 m past the crate, every ambush trigger before the gate', () => {
  for (const area of [CITY, SUBURBS, FOREST])
    for (const w of area.waves) {
      expect(w.z - 2 - w.gateZ).toBeGreaterThanOrEqual(90);
      for (const a of w.ambushes) expect(a.z).toBeGreaterThan(w.gateZ + 5);
      expect(w.quota).toBeGreaterThanOrEqual(w.ambushes.reduce((n, a) => n + a.count, 0));
    }
});
it('each wave of a night is stronger than the one before', () => {
  for (const area of [CITY, SUBURBS, FOREST])
    area.waves.forEach((w, i, all) => {
      const prev = all[i - 1];
      if (!prev) return;
      expect(w.quota).toBeGreaterThan(prev.quota);
      expect(w.faster).toBeGreaterThanOrEqual(prev.faster);
      expect(w.every[1]).toBeLessThanOrEqual(prev.every[1]);
    });
});
it('spawns out of your face: never within 12 m, always on the bank, never past the gate', () => {
  const r = rng(9);
  const zone = { startZ: -134, gateZ: -239, minX: -17, maxX: 2.5 };
  for (let i = 0; i < 2000; i++) {
    const p = { x: -2, z: -180 };
    const s = spawnSpot(p, zone, r);
    expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThanOrEqual(12);
    expect(s.x).toBeGreaterThanOrEqual(zone.minX);
    expect(s.x).toBeLessThanOrEqual(zone.maxX);
    expect(s.z).toBeGreaterThanOrEqual(zone.gateZ + 2);
  }
});
it('puts three small supplies at the water edge of every zone', () => {
  const list = edgePickups(CITY);
  expect(list).toHaveLength(CITY.waves.length * 3);
  for (const p of list) expect(p.x).toBeGreaterThan(EDGE_X - 1);
});
it('always says what to do', () => {
  expect(objective({ night: true, fighting: false, wave: 0, waves: 3, ending: false, lake: false })).toMatch(/Follow the river/);
  expect(objective({ night: true, fighting: true, wave: 2, waves: 3, ending: false, lake: false })).not.toMatch(/left/);
});
```
Run → FAIL.
- [ ] **Step 2: implement `stepWaves`:**
```ts
export const quotaOf = (def: WaveDef, k: number): number =>
  Math.max(waveTotal(def), Math.round(def.quota * k));
const reservedFrom = (def: WaveDef, fired: number): number =>
  def.ambushes.slice(fired).reduce((n, a) => n + a.count, 0);

export function stepWaves(w, waves, z, alive, dt, d, rand): WaveEvent {
  const def = waves[w.cleared];
  if (!def) return null;
  if (!w.fighting) {
    if (z > def.z) return null;
    w.fighting = true;
    w.fired = 0;
    w.toSpawn = quotaOf(def, d.quota);
    w.nextIn = 0;
    return { kind: 'start', wave: w.cleared };
  }
  const next = def.ambushes[w.fired];
  if (next && z <= next.z) {
    w.fired++;
    w.toSpawn -= next.count;
    return { kind: 'spawn', ambush: next };
  }
  w.nextIn -= dt;
  if (w.toSpawn > reservedFrom(def, w.fired) && alive < def.cap && w.nextIn <= 0) {
    w.toSpawn--;
    const [lo, hi] = def.every;
    w.nextIn = (lo + rand() * (hi - lo)) * d.interval;
    return { kind: 'one' };
  }
  if (w.toSpawn > 0 || alive > 0) return null;
  w.fighting = false;
  w.cleared++;
  return { kind: 'clear', wave: w.cleared - 1 };
}
```
`spawnSpot` (SPAWN = { near: 18, far: 32, flank: 4, keepAway: 12 }): 45 % ahead (downstream, `player.z − d`), 25 % behind (`player.z + d`, at most `startZ + 10`), 30 % from the land side (`x = minX + rand()*flank`, `z = player.z ± 14`); clamp z into `[gateZ + 2, startZ + 10]`; if the result is within `keepAway`, push it along z away from the player to exactly `keepAway` (staying inside the clamp; if the clamp forbids it, flip to the other side). `play.ts` spawns `'one'` at `spawnSpot` (6 tries against `p.blocked`), with `tuning = nightTuning(chapter, d)` plus `def.faster`, facing the player, and `horde.alert(x, z, 2)` so it hunts at once.
- [ ] **Step 3: the zones** (Normal numbers; triggers, cover and lying spots moved into each zone; existing kinds kept):
  - City: `nightStart` −124. Waves `{ z: -134, gateZ: -239, quota: 9, every: [4, 6], cap: 6, faster: 0, ambushes: [street 2 @−134, lying 2 @−160 (x −4, at −185), behind 1 @−205], crate pistol }`, `{ z: -249, gateZ: -354, quota: 12, every: [3.5, 5], cap: 8, faster: 0.15, ambushes: [street 2 @−249, lying 2 @−275 (x −6, at −300), behind 2 @−320], crate shotgun }`, `{ z: -364, gateZ: -469, quota: 15, every: [3, 4.5], cap: 10, faster: 0.3, ambushes: [street 3 @−364, cover 2 @−385 (x −13, at −405), lying 3 @−420 (x −5, at −445), behind 2 @−440], crate none }`. `safeZ` −490, boathouse at z −492, `END_Z` −505; extend the road row to −500, lights to −495, `outskirts()` rows to −500.
  - Suburbs: same z's; quotas 11 / 14 / 17, caps 7 / 9 / 11, faster 0 / 0.15 / 0.3, every [4, 5.5] / [3.5, 5] / [3, 4.5]; its cover spots (x −10, −1.5, −11) and lying (x −4, −5) re-placed inside each zone; crate rifle on wave 2. Corn rows `(−135…−340)` and `(−360…−470)`, farm fence to −480, poles to −490, the camp and cabin moved to z −486…−499 (cabin safe prop z −492), `safeZ` −490, `END_Z` −505.
  - Forest: `{ z: -134, gateZ: -239, quota: 13, every: [3, 4.5], cap: 8, faster: 0.2 }`, `{ z: -249, gateZ: -354, quota: 16, every: [2.5, 4], cap: 10, faster: 0.35 }`; the lake, Mom and `endingAt` unchanged (the ending wave is Task A9).
  - `edgePickups(area)`: for wave i, three pickups at `x = EDGE_X - 0.45`, z = `w.z − 25`, `w.z − 55`, `w.z − 85`, kinds `ammo`, `arrows`, `ammo`, ids `${area.id}-edge-${i + 1}-${k}`. `phases.ts`: `run.pickups = night ? [...waveCrates(area), ...edgePickups(area)] : area.pickups`.
  - HUD: `waveEl` shows `waveText(wave, waves)` ("Wave 2 of 3"); a new `goalEl` (class `hud-goal`, top-left under the hearts, small, 70 % opacity) shows `objective(...)`: day `'Search for supplies. Rest by the campfire when you are ready.'`; night between waves `'Follow the river. Keep moving downstream.'`; fighting `'Kill them all. The barricade falls when the wave is dead.'`; Night 3 past the last wave `'Follow the river to the lake. Mom is waiting.'`; empty during the ending. `HINTS.clear`: `['The barricade is down. Keep going downstream.']`; `HINTS.wave`: `['They are coming, and they will keep coming. Find the crate.']`.
- [ ] **Step 4:** tests PASS (update `areas/*.test.ts` that pinned old z's, `world.test.ts` strip length); `pnpm run check`.
- [ ] **Step 5: Chrome check (Normal, as a player):** Night 1: stand still at the crate 60 s (no input): zombies keep arriving from ahead, behind and the land side, never popping in within 12 m (log spawn distances); screenshot from the crate down the bank: no barricade in sight (fog). Walk to the gate: the gate opens only after the quota (log). Wave 2 faster (log tuning speed). Edge supplies glow at the water's edge. The HUD shows "Wave 1 of 3" and the goal line, no count. Night 2 and Night 3 the same. Frame time with 10 alive: `__gpuFrames(300)` p95 under 8 ms at 540 rows (re-checked at full resolution in A13).
- [ ] **Step 6: commit** `feat: waves keep coming until they are dead, longer zones, each wave harder, supplies by the water, an objective line`.

### Task A7: Rebuild Dras to real orca anatomy (eyes, mouth and jaw, a female's fin, a smooth spine)

Sonnet implementer, the controller reviews every render (ruling); headless Blender (`/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/orca.py -- public/assets/characters/orca.glb`), renders checked by eye.

**Files:**
- Rewrite: `tools/blender/orca.py` (same CLI). Output: `public/assets/characters/orca.glb` (meshopt-compressed per `tools/assets/README.md`).
- Create: `src/dreams/follow-the-river/dras-anatomy.ts` (measured constants), `src/dreams/follow-the-river/orca-model.test.ts` (reads the GLB's JSON chunk with `node:fs`).
- Modify: `fish-parts.ts` (`FIN_HEIGHT`, `BODY_HALF_WIDTH` from anatomy), `fish.ts` (`BLOWHOLE` from anatomy), `orca-grab.ts` (`jawAhead`/`jawBelow` from anatomy), `flashback-scene.ts` and `canoe-scene.ts` (young Dras and the calf use the same GLB: re-check scale and placement).

**Interfaces:**
- Produces (`dras-anatomy.ts`, metres in the model's own space, nose toward −Z, up +Y, origin at the body centre):
```ts
export const ANATOMY = {
  length: 7, // keep: every grab, strand and lane distance is built on it
  halfLength: 3.5,
  halfWidth: 0, // measured: widest half-width of the body (no fins)
  finHeight: 0, // measured: dorsal fin tip above the back
  blowhole: { ahead: 0, up: 0 }, // from the centre
  eye: { ahead: 0, up: 0, side: 0 },
  bite: { ahead: 0, below: 0 }, // the middle of the mouth, where a zombie is held
  jawOpen: 0, // radians the Jaw bone opens at most (about 0.55)
  dentZ: [0, 0] as const, // z range of the "peanut head" dent behind the blowhole
} as const;
```
(the zeros are filled with measured values in Step 4; the test pins that none is 0 except where noted).
- Bones (exact names): `Head`, `Jaw` (child of `Head`, hinge just below and behind the eye), `Spine1`…`Spine5`, `Tail1`, `Tail2`. Clips (exact names): `Swim`, `Lunge`. Materials (exact names): `orca-black`, `orca-white`, `orca-grey`, `orca-mouth`, `orca-eye`.

- [ ] **Step 1: reference.** Read three sources on killer whale external anatomy and pigmentation, and note the proportions in the ledger (grounded-research; e.g. NOAA Fisheries' killer whale species page, the Center for Whale Research ID guide, a published morphometrics table). Target proportions on a 7 m body, female:
  - Maximum girth about 38 % back from the snout; body height there about 1.3 m, width about 1.15 m; a blunt rounded head with no beak; tail stock laterally compressed (height:width about 2.5:1) with a low keel.
  - Dorsal fin (female): 0.9 m tall, falcate (curved backward), base about 0.9 m, its front edge at 46 % of the length.
  - Pectoral fins: rounded paddles 0.9 m long and 0.5 m wide, at 22–28 % of the length, low on the sides, angled down and back.
  - Flukes: span 1.5 m, swept-back tips, a central notch; the underside white.
  - Pattern: an oval white eye patch above and behind the eye (0.4 m long, tilted up toward the back); a white chin and throat from the lower jaw to between the pectorals; a white belly band narrowing between the pectorals and then sweeping up the flank behind the dorsal fin (the flank lobe); a grey saddle patch just behind the fin; everything else black.
  - Eye: small (visible radius about 3.5 cm), dark and glossy, just below the front end of the eye patch and just above the mouth line, at about 12 % of the length.
  - Mouth: a gently upturned line from the snout tip to below the eye; a lower jaw that opens; inside dark pink-grey; 10–12 small conical teeth per jaw side.
- [ ] **Step 2: build.** Loft elliptical cross-sections along the length (at least 48 rings × 24 segments before smoothing), add the fins as separate solid shells merged into one mesh, cut the lower jaw as its own vertex group weighted 100 % to `Jaw`, add mouth interior faces and teeth, and two eye spheres (16 × 12 segments) on the `orca-eye` material (roughness 0.08, near black). Apply a level 1 subdivision, then decimate to 8–12 k triangles; smooth shading with sharp edges only on fin trailing edges. Colour by material per face (no UVs needed), keeping the materials' base colours: black 0.012, white 0.8, grey 0.16 (linear), mouth 0.25/0.12/0.13, eye 0.01.
- [ ] **Step 3: rig and clips.** Bones along the midline at 0–0.18–0.32–0.46–0.60–0.72–0.84–0.94–1.12 of the length; automatic weights, then hand-fix the jaw (only `Jaw`) and the fins (pectorals to `Spine1`, dorsal to `Spine3`). `Swim` (48 frames, loops): vertical undulation (orcas beat their flukes up and down) as a wave travelling tail-ward, pitch amplitude per bone `[0.015, 0.02, 0.03, 0.045, 0.065, 0.09, 0.14, 0.22]` rad with a phase lag of 0.55 rad per bone; the head barely moves. `Lunge` (24 frames, once): the head rears up 0.35 rad, the tail drives down, then settles. The jaw is driven by code (not keyed in either clip).
- [ ] **Step 4: measure and write `dras-anatomy.ts`** from the built mesh in Blender (print the values; never eyeball them into code).
- [ ] **Step 5: renders.** Four 1024 px renders on a neutral grey background (left side, right three-quarter front, top, underside) and one close-up of the head with the jaw open 0.5 rad, saved to the scratchpad; compare each with the references. Fix and re-render until a person would say "that's an orca": tall-enough rounded body, no blob, eyes visible as small dark dots in front of the white patches, mouth line readable.
- [ ] **Step 6: failing test, then green** (`orca-model.test.ts`):
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANATOMY } from './dras-anatomy';

function gltf(path: string): { materials: { name: string }[]; animations: { name: string }[]; nodes: { name?: string }[] } {
  const b = readFileSync(path);
  const length = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + length).toString('utf8'));
}

describe('Dras model', () => {
  const j = gltf('public/assets/characters/orca.glb');
  it('has her materials, bones and clips', () => {
    expect(j.materials.map((m) => m.name).sort()).toEqual(['orca-black', 'orca-eye', 'orca-grey', 'orca-mouth', 'orca-white']);
    const names = j.nodes.map((n) => n.name);
    for (const b of ['Head', 'Jaw', 'Spine1', 'Spine5', 'Tail1', 'Tail2']) expect(names).toContain(b);
    expect(j.animations.map((a) => a.name).sort()).toEqual(['Lunge', 'Swim']);
  });
  it('was measured', () => {
    expect(ANATOMY.halfWidth).toBeGreaterThan(0.4);
    expect(ANATOMY.finHeight).toBeGreaterThan(0.7);
    expect(ANATOMY.finHeight).toBeLessThan(1.1);
    expect(ANATOMY.eye.side).toBeGreaterThan(0.2);
    expect(ANATOMY.bite.ahead).toBeGreaterThan(2.5);
    expect(ANATOMY.jawOpen).toBeGreaterThan(0.3);
  });
});
```
- [ ] **Step 7: code follows the model.** `FIN_HEIGHT = ANATOMY.finHeight`, `BODY_HALF_WIDTH = ANATOMY.halfWidth`, `BLOWHOLE = ANATOMY.blowhole`, `GRAB.jawAhead = ANATOMY.bite.ahead`, `GRAB.jawBelow = ANATOMY.bite.below`. Run every fish/grab/strand test; fix expectations that encoded the old 1.45 m fin.
- [ ] **Step 8: Chrome check:** intro (she takes the pack), Night 1 cruise (fin, wake), a grab (side view), the tank flashback (young Dras, scale 0.4) and the canoe calf (0.35): screenshots, each reads as a black-and-white orca with a visible eye. `?webgl` the same.
- [ ] **Step 9: commit** `feat: Dras rebuilt to real orca anatomy: eyes, a jaw that opens, a female's curved fin`.

### Task A8: Dras' sickness, the real way (black and white stay, lesions and wasting grow with every zombie)

**Files:**
- Rewrite: `src/dreams/follow-the-river/orca-sick.ts` (+ `orca-sick.test.ts`).
- Modify: `fish-state.ts:121-127` (per-instance node materials), `fish.ts` (`setSickness`, blow, surfacing, `onEat`), `fish-parts.ts` (`nextSurfacing(rand, sickness)`), `state.ts` (`RunState.eaten`, `normalizeSave`), `phases.ts:93`, `ending.ts:261` (fight sickness), `assemble.ts` (wire `onEat`).

**Interfaces:**
- Produces:
```ts
export const SICK = {
  /** Sickness never drops below this in a phase (the story), whatever was eaten. */
  floor: { intro: 0, day1: 0, night1: 0, day2: 0.1, night2: 0.15, day3: 0.35, night3: 0.4, end: 1 } as Record<Phase, number>,
  /** Each zombie she eats. */
  perKill: 0.015,
  /** Until the very end she is never more than this sick. */
  cap: 0.9,
  lesion: 0x5e5b57,
  speck: 0x060606,
  /** Metres the peanut-head dent sinks at its worst, and how much thinner (share of width). */
  dent: 0.12,
  thin: 0.1,
  mist: { well: 0xd8e2e8, sick: 0xa8463f, redFrom: 0.95 },
  blow: { seconds: 1.4, rise: 1.6, size: 2.2, opacity: 0.55 },
  slow: 0.3,
} as const;
export function sicknessAt(phase: Phase, eaten: number): number;
export interface Sickness { readonly k: number; set(k: number): void }
export function makeSick(body: THREE.Object3D): Sickness; // swaps her materials for node materials driven by one uniform
export function mistColor(k: number, out: THREE.Color): THREE.Color; // pale until redFrom, then red
export function blowAt(t: number, k: number, out: Blow): boolean; // weaker and lower the sicker
```
`RunState.eaten: number` (save: optional on disk, `normalizeSave` fills 0); `Fish.onEat: (() => void) | null`.

- [ ] **Step 1: failing tests** (`orca-sick.test.ts`, replacing the tint tests):
```ts
it('starts healthy and grows with every zombie eaten, above the story floor', () => {
  expect(sicknessAt('day1', 0)).toBe(0);
  expect(sicknessAt('night1', 10)).toBeCloseTo(0.15);
  expect(sicknessAt('night2', 0)).toBe(0.15);
  expect(sicknessAt('night3', 30)).toBeCloseTo(0.45);
  expect(sicknessAt('night3', 500)).toBe(0.9);
  expect(sicknessAt('end', 0)).toBe(1);
});
it('her breath stays pale until the very end', () => {
  const c = new THREE.Color();
  expect(mistColor(0.9, c).getHex()).toBe(new THREE.Color(SICK.mist.well).getHex());
  expect(mistColor(1, c).r).toBeGreaterThan(mistColor(0.9, new THREE.Color()).r - 0.0001);
});
it('a sick blow is smaller and fainter', () => {
  const a = { rise: 0, size: 0, opacity: 0 };
  const b = { rise: 0, size: 0, opacity: 0 };
  blowAt(0.5, 0, a);
  blowAt(0.5, 0.9, b);
  expect(b.size).toBeLessThan(a.size);
  expect(b.opacity).toBeLessThan(a.opacity);
});
it('keeps every material its own base colour (black stays black)', () => {
  const body = new THREE.Group();
  for (const [name, hex] of [['orca-black', 0x030303], ['orca-white', 0xe7e9eb], ['orca-grey', 0x6f7276]] as const)
    body.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name, color: hex })));
  const sick = makeSick(body);
  sick.set(0.8);
  const colours = body.children.map((m) => ((m as THREE.Mesh).material as THREE.MeshStandardNodeMaterial).color.getHex());
  expect(colours).toEqual([0x030303, 0xe7e9eb, 0x6f7276]);
});
it('surfaces more often when sick (logging at the surface)', () => {
  expect(nextSurfacing(0.5, 0.9)).toBeLessThan(nextSurfacing(0.5, 0));
});
```
- [ ] **Step 2: the shader** (TSL, `orca-sick.ts`; verify each import exists in `node_modules/three/src/nodes/TSL.js` first):
```ts
import { color, float, mix, mx_noise_float, normalLocal, positionLocal, smoothstep, step, uniform, vec3 } from 'three/tsl';

function lesions(base: THREE.Color, k: THREE.UniformNode<number>) {
  const p = positionLocal;
  const patch = mx_noise_float(p.mul(0.9)).mul(0.5).add(0.5);
  const blotch = smoothstep(0.42, 0.58, patch).mul(smoothstep(0.1, 0.45, k));
  const ring = float(1).sub(mx_noise_float(p.mul(3.1)).abs().mul(14)).clamp(0, 1).mul(smoothstep(0.3, 0.7, k));
  const speck = step(0.8, mx_noise_float(p.mul(28)).mul(0.5).add(0.5)).mul(smoothstep(0.35, 0.8, k));
  const grey = color(SICK.lesion);
  const c1 = mix(color(base), grey, blotch.mul(0.6));
  const c2 = mix(c1, grey, ring.mul(0.5));
  return mix(c2, color(SICK.speck), speck);
}

function wasting(k: THREE.UniformNode<number>) {
  const [z0, z1] = ANATOMY.dentZ;
  const band = smoothstep(z0 - 0.3, z0, positionLocal.z).mul(smoothstep(z1 + 0.3, z1, positionLocal.z));
  const top = smoothstep(0.1, 0.5, positionLocal.y);
  const dent = band.mul(top).mul(smoothstep(0.35, 1, k)).mul(SICK.dent);
  const thin = float(1).sub(smoothstep(0.5, 1, k).mul(SICK.thin));
  return positionLocal.mul(vec3(thin, 1, 1)).sub(normalLocal.mul(dent));
}
```
`makeSick(body)`: one `uniform(0)` per call; every mesh's material becomes a `MeshStandardNodeMaterial` with the source's `name`, `color`, `roughness` (keep `makeWet`'s 0.3), `metalness`; the three skin materials get `colorNode = lesions(src.color, k)`; every body material (eye and mouth too) gets `positionNode = wasting(k)` so the dent never tears a seam. `fish-state.ts createState` calls it instead of `material.clone()` (each fish its own uniform: the calf and the young Dras stay healthy because they never call `set`). Positions after skinning: `NodeMaterial.setupPosition` runs `skinning()` before `positionNode` (verified in `node_modules/three/src/materials/nodes/NodeMaterial.js:766-806`), so `positionLocal` is the posed position.
- [ ] **Step 3: wiring.** `phases.ts`: `fish.setSickness(sicknessAt(save.phase, run.live.eaten))`. `fish.ts`: when a grab's victim drowns, `f.onEat?.()`; `assemble`/`chapter` sets `fish.onEat = () => { run.live.eaten++; fish.setSickness(sicknessAt(run.phase, run.live.eaten)); }`. The fight (`ending.ts`) uses the same path; the strand sets 1. Blow: `blowOut` plays the blow sound at `1 - 0.5 * k` volume and `playbackRate 1 - 0.25 * k` (wheezier); surfacing: `nextSurfacing(rand, k)` = interval × `(1 - 0.45 * k)`, and at k > 0.5 she stays up 1.6× longer (`SURFACE_TIME` × `1 + 0.6 * smoothstep`).
- [ ] **Step 4:** tests PASS; `pnpm run check`.
- [ ] **Step 5: Chrome check (the colour Kartik complained about):** for k in 0, 0.15, 0.45, 0.9, 1 call `kdRiver.fish.setSickness(k)` on Night 1 with Dras surfaced beside you (force a surfacing), screenshot side views: black body black, white patches white at every k; blotches, rings and specks appear only from about 0.15 and grow; the dent behind the blowhole shows from about 0.5; at 1 the breath is red. Also `?webgl`. Put the five screenshots side by side in the ledger notes.
- [ ] **Step 6: commit** `fix: Dras keeps her black and white; sickness shows as lesions and wasting that grow with every zombie she eats`.
