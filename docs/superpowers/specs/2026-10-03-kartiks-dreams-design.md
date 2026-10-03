# Kartik's Dreams — Design Spec

Date: 2026-10-03 · Status: draft for review

## Goal

Turn Kartik's real dreams (kept in phone notes) into short first-person horror games that anyone can play from one link in a desktop browser. One shared engine and home screen; one dream = one game. The first dream is **Follow the River**.

Success: a stranger opens the link in Chrome or Safari on a laptop, picks a dream, understands the rules without help, feels dread, and finishes in about 12 minutes.

## Decisions (agreed in brainstorming)

| Topic | Decision |
|---|---|
| Platform | Desktop/laptop browsers only (Chrome, Safari, also Firefox/Edge). Keyboard + mouse. Touch-only devices see a "play on a computer" screen. |
| Rendering | 3D, three.js `WebGPURenderer` (WebGPU, automatic WebGL 2 fallback). `?webgl` URL flag forces WebGL 2. |
| Look | Stylised low-poly (reference: Crow Country), but not crude: 540-row render scaled up crisply, bloom on lamps/windows, vignette, light film grain, soft shadows from lamps and the flashlight, smooth-shaded organic shapes. Fog and darkness. **Never bright**: even "day" is overcast, grey and smoky. |
| No world edge | Every outdoor scene has a gradient sky dome, ground/water running far past the play area, and distant silhouettes (skyline, tree lines, hills) that fade into fog. Play space is bounded by believable blockers, never a visible cliff or void. Blender builds richer scenery where needed. |
| Full screen | Start enters browser full screen (hides the browser bars); the pause menu toggles it. |
| Camera | First person. Few human characters (silhouettes, voices, tapes). |
| Genre | Horror with jumpscares; content warning before each dream. |
| Backend | None. All progress in the player's browser (`localStorage`), wrapped so blocked storage never crashes the game. |
| Hosting | Static build on Vercel (top-level page, not an iframe, so saves persist). |
| Art | Free CC0 low-poly packs (Kenney, Quaternius), license checked per asset, listed in `public/assets/LICENSES.md`. Blender (headless scripts or the Blender Lab MCP) converts/poses models. |
| Sound | CC0 packs or procedural Web Audio. Voices = subtitles over muffled/garbled tape audio. |
| Tooling | Same rules as `~/Code/base-repo-ts` (pnpm, oxlint type-aware, Prettier + organize-imports, `tsc --noEmit`, Vitest, `.nvmrc` = `lts/*`), on Vite instead of Next.js. Latest stable, mutually compatible versions — never hardcoded in docs. |

## Home screen — "Kartik's Dreams"

- Low-poly bedroom at night, moonlight through a window, a dim table lamp. Kartik asleep in bed under a blanket; "Z" letters float up from the sleeper's head and fade. Quiet room tone.
- **Start** (click — also unlocks audio): the camera rises, following the Zzz, into a dark "dream cloud".
- The cloud shows one card per dream: title, length, warnings (e.g. "Horror · jumpscares"). Only Follow the River for now; more dreams are added to a registry later.
- Picking a card: screen fades to black like falling deeper asleep; the dream's code loads on demand (dynamic import) so the home screen stays fast. If loading fails, return to the cloud with a message.
- Before play: content warning + one goal card ("Follow the river. Survive 3 nights.").

## Shared engine behaviour

- **Controls:** WASD move, mouse look (Pointer Lock), Shift sprint, F flashlight, 1/2 weapons, click fire, E interact/throw. Esc releases the mouse and opens the pause menu.
- **Player-paced text:** every tutorial page, hint, goal card and story subtitle waits for the player — it never auto-advances or disappears on a timer. Enter, → or Space = next; ← or Backspace = previous; a Skip button skips the rest; on-screen Next/Back buttons do the same. Large, high-contrast text. Gameplay pauses while a page is open. (Kartik's parents are slow readers.)
- **Pause menu:** Resume, How to Play (every rule of the current dream), mouse sensitivity, volume, Quit to home. Settings persist in the browser.
- **Pointer lock failures** (denied, or re-lock too soon after Esc) keep the pause menu up instead of breaking.
- **Frame time** is clamped so a tab switch never teleports the player.
- **Saves:** one entry per dream (current phase, supplies, found tapes) + one settings entry. Corrupt or unreadable data falls back to defaults.

## Dream 1 — Follow the River

### Story

A virus breaks out. Mom sees it on the TV news and knows many won't survive. She rushes to the store, buys a pack of fish, throws it into the river — a huge shape passes under the water and vanishes. She tells you: "Run. Always follow the river." She stays behind, filming, whispering "What have we done…"

You run downstream for three days and three nights. The giant fish in the river protects you from zombies. Mom's video tapes reveal the truth: she worked at a lab; the experiment that grew her pet fish also leaked the virus. At the end you reach the dam and find Mom. On the last night the fish dies protecting you both. Bittersweet ending.

### Structure (about 12 minutes)

| Phase | Area | Notes |
|---|---|---|
| Intro | Home by the river | Teaches walk/look/interact. TV news, Mom, fish thrown in. |
| Day 1 → Night 1 | City → run to suburbs | Flashlight + bow. Tape 1. |
| Day 2 → Night 2 | Suburbs & farms → run to forest | Gun found in a police car. Tape 2. |
| Day 3 → Night 3 | Forest → run to the dam | Tape 3. Mom found; fish dies; ending. |

### Day (player chooses when it ends)

- Explore the area around the river. Scavenge batteries, arrows, ammo, fish packs, and one tape.
- A few slow zombies lurk inside buildings, plus scripted jumpscares.
- Return to the river and choose "Wait for dark" to start the night.

### Night (keep moving)

- Run downstream in the dark to the next area's safe spot. Many fast zombies.
- **Flashlight** stuns zombies; battery drains. **Bow** is silent; arrows can be recovered. **Gun** (from Day 2) is strong but loud — noise draws more zombies.
- **Fish:** each fish pack thrown into the river by day = more strikes that night. The fish automatically strikes zombies near the water. Fighting near the river is the strongest defence.

### Rules

- Death restarts the current phase with the supplies held when it began (checkpoint at the start of every day and night).
- First-time hints (player-paced pages, see Shared engine behaviour) teach each rule when it first matters (fish packs, wait for dark, flashlight, bow vs gun noise).
- Small HUD: battery, arrows, ammo, fish packs.

## Architecture

- One Vite app at the repo root, plain TypeScript (no UI framework). Menus/HUD are HTML/CSS over the canvas.
- `src/engine/` — shared: stage (renderer, scene, camera, loop, resize, low-res), input, first-person player + collisions, saves/settings, audio, UI overlay, device check, model loading.
- `src/home/` — bedroom scene, Zzz, dream cloud, card picking.
- `src/dreams/` — registry + one folder per dream, loaded with dynamic `import()`.
- `public/assets/` — models and sounds + `LICENSES.md`.
- Pure logic (math, saves, state machines) lives in small functions with Vitest tests; rendering is checked in the browser (Claude in Chrome) on both WebGPU and `?webgl`.

## Milestones

1. **Plan 1 — Foundation & Home:** tooling, engine, home screen (quiet: soft sleep breathing only), dream picker, pause/settings, graphics pass, a test riverbank with a flowing river, Blender-built skyline and one scripted scare (the watcher), Vercel-ready build.
2. **Plan 2 — Follow the River v1:** asset pipeline (zombies, fish, city kit via Blender), intro, Day 1, Night 1, weapons, fish, checkpoints, hints, "To be continued".
3. **Plan 3 — Days 2–3 and the ending.**

## Out of scope (for now)

Phones/touch controls, backend/accounts/leaderboards, multiplayer, voice acting, settings beyond sensitivity and volume.

## Risks

- WebGPU vs WebGL 2 differences — every milestone is checked on both backends.
- Safari specifics (WebGPU, pointer lock) — manual Safari check at the end of each plan.
- Safari deletes site storage after 7 days without a visit — acceptable for 12-minute games.
- Free packs may not cover everything (e.g. a menacing giant fish) — Blender edits fill gaps.
