# Plan 9: the last iteration ("from now the game should be flawless")

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (or `superpowers:subagent-driven-development`) to carry this out task by task.
> - Also use `grounded-research` for any asset, sound, API or version.
> - Also use the repo skill `webgpu-threejs-tsl` for every three.js / TSL change.
> - Subagents run on Sonnet only (`model: "sonnet"`).
> - Work in a git worktree (`.claude/worktrees/plan-9`, branch `plan-9`) with its own Vite port. :5173 is Kartik's: leave it alone.
> - Commit per task. When everything is verified, fast-forward local `main`. NEVER push.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md`. Kartik's feedback below is binding and overrides it.

**State at writing:** `main` at `851f1b8`, 402 tests, `pnpm run check` green.

---

## 0. HOW TO TEST (Kartik's main complaint: "what do you even test?")

Every task ends with a **player's-eye check** in Chrome, not just numbers. Look at each screenshot and ask: "would a player think this is broken?" Specifically check:
- object colours against a reference (the orca must stay black and white);
- the viewmodel / HUD during cutscenes;
- objects floating or sunk;
- things popping in;
- whether text matches the animation;
- fade state after transitions;
- frame rate.

**Chrome harness** (the tab is hidden; Chrome throttles rAF and `setTimeout`):
```js
Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});
const anim = kd.stage.renderer._animation, loop = anim._animationLoop; anim.stop();
let T = performance.now();
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
window.__step = async (n) => { for (let i = 0; i < n; i++) { T += 16.7; anim.nodes.nodeFrame.update(); loop(T); if (i % 5 === 0) await tick(); } };
window.__click = (label) => { const b=[...document.querySelectorAll('#overlay button')].find(b=>b.textContent.includes(label)); b?.click(); return !!b; };
```
- Boot: Start (about 600 frames), 'Follow the River', 'Enter the dream', wait for `window.kdRiver`, then Skip the pages.
- `kdRiver` is the chapter's systems (`ctx`, `horde`, `fish`, `gates`, `world`...).
- To reach a scene module directly: `await import('/src/dreams/follow-the-river/canoe-ride.ts')`.
- The page reloads on any file edit: re-run the setup.
- Measure FPS by timing real frames, without the manual stepping.

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

## 3. Tasks (each: TDD where pure, then a player's-eye Chrome check, then commit)

- **T1 Quick fixes:**
  - throw revert (#1);
  - phone prop (#2);
  - name Kartik in all text (grep "K," "K." "K —" in `tapes.ts`/`intro.ts`/`ending*`);
  - home fade-in (#25);
  - torch stun (#13);
  - viewmodel/HUD hidden in all cutscenes and the farewell (#17 part);
  - "Mom stops rowing" sync (#23);
  - trees grounded (#22).
- **T2 The creature's look:** white bug (#3); gradual realistic sickness via TSL (#4); wheezy blow; the per-zombie progression.
- **T3 The creature's behaviour:**
  - fin never over the land (#5);
  - every kill carried in its jaws into the water (#6);
  - the ending strikes only near you and Mom (#15);
  - the visible swim-in strand (#16).
- **T4 Rename + lore:**
  - all text says Dras / Subject R-7 / it, never "orca" (on-screen strings only; code identifiers may stay);
  - tapes explain the freshwater variant engineered to clean the river;
  - **a new flashback: Mom naming it "Dras" at the tank** (reuse `flashback-scene.ts` tape 2's tank set).
- **T5 Waves rework** (#8–11): longer zones; time-driven random spawns per wave plus a few ambushes; escalating waves; objective hints; tests.
- **T6 Balance + difficulty menu** (#12, #14):
  - Story / Normal / Hard in settings, chosen in a menu on "Enter the dream";
  - scarce crates; river-edge ammo/arrow pickups;
  - per-difficulty knobs (zombie speed, wave size, ammo, stun).
- **T7 Invisible wall** (#7): find and remove it; make the water's edge reachable on all banks; test.
- **T8 Kartik's model** (agent, Blender):
  - Quaternius man casual from the men pack (already downloaded for `zombify.py`; see `tools/assets/README.md`), as `characters/kartik.glb`, with Sit / Kneel / Idle / Walk clips (reuse the `mom_clips.py` approach);
  - plus a first-person arm+hand viewmodel cut from him.
- **T9 Farewell cinematic** (#17, #18): kneel beside you; both hands on it; head lift and eye turn; the orbit camera; the CC0 creature reply sound; then the pack.
- **T10 Sunrise + FPS** (#19): profile and fix the frame drops; a real sunrise palette (warm yellow sun, blue sky, the moon fading).
- **T11 Canoe ride** (#20, #21, #24): paddle-stroke sounds plus water and birds (CC0); the talk with Mom; the zoom-out ending shot with Kartik in the boat; credits.
- **T12 Full play-through QA, Chrome, as a player:**
  - the cold open → intro → every day and night (with deaths, checkpoint resumes, difficulty levels) → the ending → home;
  - screenshots at every beat;
  - FPS check;
  - fix anything a player would notice;
  - update docs (results), `LICENSES.md`, memory; merge to main.

## 4. Existing facts to reuse

- Mom's clips: `mom.glb` has Sit, Row, Kneel, Throw (`tools/blender/mom_clips.py`, from UAL CC0 at `scratchpad/assets/zombie-candidates/ual1|ual2`).
- Mom's canoe paddle is pinned between `WristL`/`WristR` (`canoe-ride.ts holdPaddle`).
- The ending: `ending.ts` (steps mom → fight → strand → song → hand → pack → dawn → ride → credits), `ending-farewell.ts` (FAREWELL spots, `Run.interact` E hook), `orca-strand.ts`, `orca-sick.ts`, `orca-grab.ts` (StrikeStyle, pace, sweep), `fish.ts`/`fish-state.ts`.
- Waves: `waves.ts` (`WaveDef.ambushes`, `stepWaves`, gates), areas' `waves` blocks, `play.ts` `tickWaves`/`spawnAmbush`, `phases.ts` (checkpoint, topUp).
- Weapons: `gun.ts` (Armory), `weapons.ts` GUNS; sounds `public/assets/sounds/weapons/*` (CC0 Free Firearm Sound Library).
- The canoe: `canoe-scene.ts`, `canoe-ride.ts` (RIDE 72 s, the calf, CLOSING_PAGES).
