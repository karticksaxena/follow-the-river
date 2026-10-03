# Plan 2 results — Follow the River v1

## What shipped

- Intro: TV news, Mom leaves and returns with the fish, dusk outside, the orca fin, the throw, goodbye.
- Day 1: overcast city, shacks, supplies, tape 1 (an ambush zombie rises after it), bow, flashlight.
- Night 1: 14 people-zombies, flashlight stun, orca strikes, checkpoints, death and restart, boathouse arrival.
- "To be continued" screen. Progress saves through `createSaveStore`.

## How to play-test

- `pnpm run dev`, then `http://localhost:5173/?nolock` (add `&webgl` to force WebGL 2).
- Jump: `?phase=intro`, `?phase=day1`, `?phase=night1`.
- Console: `window.kd` (app), `window.kdRiver` (river systems). Dev only.
- Hidden tab: Chrome pauses rAF and THREE.Timer zeroes delta. Override `document.hidden` and step `renderer._animation._animationLoop(t)` manually.

## Measured

- Draw calls: ~990 → ~73–99 per view (static props batched per material and map cell).
- Tests: 214+ pass; `pnpm run check` green.
- Audio: groans peak −0.1 dB, RMS −12.6…−19.1 dB; no gain table needed.

## Check by hand (Kartik)

- Real audio levels with headphones.
- Safari (WebGPU/WebGL, audio resume).
- Pointer lock, Esc during every system, quit mid-night and Continue.

## Plan 3 inputs

- Suburbs/farms area.
- Gun from the police car, with noise alerts.
- Forest and the dam.
- Tapes 2–3.
- Mom reunion.
- The orca's death and the ending.
- Open items: `plans/2026-10-03-plan-1-followups.md` ("Still open").
