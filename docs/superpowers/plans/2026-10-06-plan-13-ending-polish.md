# Plan 13: ending polish (Kartik's Night 3 play-test, 2026-10-06)

> For agentic workers: superpowers:subagent-driven-development (Sonnet implementers, controller verifies in Chrome).

**Goal:** fix every issue Kartik hit from Night 3 wave 2 to the end, in the shared code paths (all pages, all beats).
**Spec:** docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md. Feedback: memory plan13-feedback (B1-B5).

## Global constraints
- Vite + TS strict, three r186.1 WebGPU (WebGL 2 fallback); pnpm; `pnpm run check` green before every commit (controller commits, explicit paths).
- No console, no innerHTML, files < 500 lines, functions < 50 lines, named constants, player-paced text via pages.
- Never toggle castShadow/add or remove lights/swap env maps at runtime (recompiles); warm-ups cover new materials.
- Subagents: Sonnet, no commits, no git stash/checkout/restore/reset, no dev servers, no Chrome.

## Tasks
- **A - Text boxes: visible cursor, Esc opens the pause menu, no full-screen bubble** (engine: menus.ts, session.ts, fullscreen.ts, player.ts, style.css). Brief: task-A-brief.md.
- **B - Farewell orca: 60-70% of her on land in every beat; no tilted/broken pose at the hand beat** (ending-farewell.ts, farewell-shots.ts, fish/orca pose, lake/banks). Brief after the controller's Chrome screenshots: task-B-brief.md.
- **C - Canoe ride ending: keeps moving while it fades out; no abrupt stop or hitch into the credits; calf a little smaller** (canoe-ride*.ts, canoe-scene.ts, index.ts credits hand-off). Brief: task-C-brief.md.

## Review focus
1. Pages opened while the mouse is captured AND while it is free (Esc pressed before) both show a usable cursor; keyboard (Enter/arrows) still works.
2. Esc during a page with a cutscene running: the pause menu opens, Resume returns to the same page, the cutscene does not advance underneath.
3. Every farewell beat (Mom walks, sings, kneel, hand, pack, dawn): the orca's land share is 60-70% and she rests upright, no bone distortion.
4. The ride's last seconds: motion continues under the fade, no frame over 50 ms at the hand-off to the credits.
