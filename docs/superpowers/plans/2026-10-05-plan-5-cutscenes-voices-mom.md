# Plan 5 — Story told in motion: a living Mom, Stray-style voices, a cold open, tape flashbacks, edge-case sweep

**Why (Kartik, 2026-10-04/05):**

- "I don't want static animations of mom. Mom should be able to move around a bit in the house, look a bit tensed. Mom is just standing and then another scene she is just coming in."
- Voices like Stray: no real speech, characters make vocal sounds and the line appears as English text.
- "Stories back story can be through animations as well": an animated cutscene of how the story started, and the back-story told through animation.
- "Test each and everything … with edge cases … not stop until all things are done."

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md`.

## Global constraints (from CLAUDE.md, binding)

- **Player-paced text:** every caption or subtitle is a `ctx.read`/`showPages` page. Animation beats between pages may be timed in game time; text never advances on a timer.
- **Pause-safe and quit-safe:** cutscene beats run on game time only, frozen while paused. A Quit or dispose mid-scene leaves nothing behind (no lights, loops or meshes); every await checks for cancellation. Copy the patterns in intro.ts and ending.ts.
- **Skippable:** every cutscene can be skipped (pager Skip, plus a top-level "Skip scene").
- **Look and code rules:**
  - Never bright; dim, named light and colour constants; no world edge.
  - Performance: no per-frame allocations; functions < 50 lines; files < 500 lines.
  - Imports from `three/webgpu`, `three/tsl`, `three/addons/...js`. No console, no innerHTML.
- **Assets:** CC0 or original (Blender scripts in tools/blender/), each listed in `public/assets/LICENSES.md`. Characters: `characters/mom.glb`, with clips Idle, Idle_Neutral, Walk, Run, Interact, Wave, HitRecieve, Idle_Gun_Pointing (usable as "holding the phone up to film"), Death. Also `characters/orca.glb` and the zombies.
- **Read first:** the project skill `.claude/skills/webgpu-threejs-tsl/SKILL.md` (and its docs) for any TSL/material work.

## Tasks

### Task 1 — Stray-style voices (voice.ts + voice.test.ts, sounds.ts, engine/menus.ts, session.ts, dreams/types.ts, tapes.ts, ending.ts)

- **Synthesis:** a pure `babbleSamples(text, voice, rate)` makes one wordless vocal line per page:
  - A glottal pulse or saw at f0 through two or three vowel formant band-passes.
  - One syllable per word (2–3 for long words), with random vowels seeded from the text so the same line always sounds the same.
  - A gentle pitch contour: falls at a period, rises at a "?".
  - Short gaps at commas and full stops.
  - About 0.07 s per character, capped at 4 s.
- **Voices** (named constants):
  - `mom`: f0 ≈ 210 Hz, warm, slightly shaky (tense).
  - `anchor`: f0 ≈ 120 Hz, band-passed like a TV speaker.
  - `tape`: Mom's voice muffled, with hiss and wow (replaces today's looped noise `tapeVoice`).
- **Wiring:**
  - `ctx.read(pages, onDone, { voice?: (page: string) => Voice | null })`. The pager calls back on every page shown (Next, Back and first open), stops the previous line and plays the new one on the 'voice' channel. Skip and close stop it.
  - Mapping:
    - Pages starting `Mom:` use `mom`.
    - Quoted TV lines and `BREAKING NEWS` use `anchor`.
    - Tape transcript lines in quotes use `tape`.
    - Narration (no quotes) is silent.
  - Wire tapes.ts and ending.ts. Task 2 wires the intro's own reads.
- **Tests:** deterministic per text, length scales with text and is capped, no clicks at the ends, period vs question contour, and the voice-mapping function.

### Task 2 — Mom alive in the intro (new mom-actor.ts (+test), intro-scene.ts, intro.ts)

- Add a `MomActor` around `createMom`:
  - `walkTo(points, speed)` follows waypoints with the Walk clip and turns smoothly (game time, cancellable, as a Promise).
  - `idleTense()`: Idle_Neutral with small weight shifts, occasional Interact (a hand gesture), and a turn of the body toward the TV or window every few seconds.
  - `faceTo(x, z)`.
- **Choreography:**
  - **news:** while the TV plays, Mom paces behind the couch between two or three points, stops, looks at the TV, gestures. After her line she walks to the door and out of sight (`mom-leaves`), not cut away.
  - **mom-back:** "An hour later" → she walks in through the door with the fish pack in hand and comes to the player.
  - **outside:** she walks ahead of the player to the water's edge (`momRiver`) instead of already standing there.
  - **throw:** walk the last steps, then Interact as the throw.
  - **goodbye:** she backs off a step and holds the phone up (Idle_Gun_Pointing) while filming.
- Keep every page and step order (intro.test.ts stays green). Wire `{ voice }` into the intro's reads once Task 1's option exists (Task 1 lands the engine hook; if it isn't there yet, add the call and the controller resolves it).

### Task 3 — Cold open: how it started (new coldopen.ts (+test) and coldopen-scene.ts; index.ts hook)

- A skippable 40–60 s animated cold open before a new run's intro, shown once per new run (not on Continue).
- Camera shots in game time, built from existing assets:
  1. A slow aerial drift over the city river at dusk: the Day 1 city area, with distant sirens or alarm (existing stings) and a few lit windows.
  2. A street corner: one figure staggers under a streetlight and others shamble (zombies, Walk), then a car alarm.
  3. A push-in on a riverside house window with TV glow inside, matching the intro's house. Cut to the intro.
- Captions, player-paced, between beats:
  - "It started on an ordinary evening."
  - "By night, the city was not the city any more."
  - "Across the river, a TV was still on."
- A title card "Follow the River".
- Reuse `buildWorld(CITY)` or a light subset; dispose everything when it ends.

### Task 4 — Lab and dam props for tape flashbacks (Blender, tools/blender/flashback_props.py → public/assets/props/{lab,tank,cage}.glb)

- **lab:** a dim lab room 8 × 6 × 3 m with a bench, monitors (a faint emissive screen) and a red warning lamp.
- **tank:** a large glass tank 5 × 3 × 2.5 m. The glass is a separate material named `Glass` so code can make it transparent.
- **cage:** a small mouse cage with a bent-open door.
- Same style as plan3_props.py (low-poly, flat colours, origin at floor centre). Add a LICENSES.md line.

### Task 5 — Tapes as animated flashbacks (after Tasks 1 and 4: flashback.ts, flashback-scene.ts, tapes.ts)

- While a tape plays, the screen shows a small flashback scene behind its subtitles. The game is paused and the chapter scene is hidden; it is restored after.
  - **Tape 1:** the lab at night. Mom at the bench, an empty mouse cage, the red lamp pulsing.
  - **Tape 2:** Mom at the tank, the young orca (orca.glb at about 0.4 scale) gliding behind the glass toward her (she "sings").
  - **Tape 3:** night at the dam spillway. Mom watching the orca slip into the river.
- A slow camera drift per shot, all pause-safe and disposed after.

### Task 6 — Edge cases and full sweep (controller, plus a test agent)

- **Automated:** corrupt or blocked storage; Continue at every phase; Quit during every cutscene, tape and the ending; death during pages; zero arrows, ammo and battery; rapid E, Esc and click; window resize; the `?webgl` path.
- **Chrome:** intro → credits; each tape flashback; cold open skip; orca in the water at all times; Mom stays on land.
- Then review, fixes, and merge to main.

## Later

- First-person hands.
