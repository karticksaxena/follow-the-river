# Plan 3 results — Follow the River, the full dream

## What shipped

- Chapter router: Night 1 → Day 2 → Night 2 → Day 3 → Night 3 → the ending. Old saves get `hasGun: false`.
- Day 2, suburbs and farms: houses, garages, a barn with Tape 2, the crashed police car with the pistol, corn, a farm-gate barricade. Night 2 runs to a ranger cabin.
- Day 3, forest: pines, a campsite of the dead, a cabin with Tape 3, a log barricade. Night 3 runs down to a lake.
- The gun: 1/2 or the mouse wheel to switch; loud hitscan that makes the horde spawn faster for a while; dry-fire click when empty.
- Nights get harder each chapter: Night 1 up to 14 zombies, Night 2 up to 18, Night 3 up to 22.
- Mom's Tapes 2 and 3 reveal the orca's cell line and the lab below the dam.
- The ending. The river opens into a forest lake below the dam, and Mom waits on a pebble shore with a lantern and a canoe.
  - Mom's pages, then a final wave of 12 zombies charges along the bank.
  - The orca strikes again and again, then makes its last lunge, rolls over and sinks.
  - Silence, then Mom's last pages.
  - A grey dawn with a pale sun over the dam, then the epilogue and credits.
  - The run saves as finished.
- Player-paced pages sit low on the screen (subtitle position) so the scene stays in view.
- New sounds are procedural: gunshot, dry fire, the orca's cry, the dawn pad.

## Decisions made during the build

- The river ends in a lake, not at the dam. Kartik chose "Lake shore, dam far" on 2026-10-04. Mom stands at ground level and stays visible; the dam is a silhouette across the water that appears at dawn.

## How to play-test

- `pnpm run dev`, then `http://localhost:5173/?nolock` (add `&webgl` to force WebGL 2).
- Jump to a phase with `?phase=intro`, `day1` … `night3`. The ending starts at the shore at the end of Night 3.
- Console (dev only): `window.kd` (app), `window.kdRiver` (river systems).
- Hidden tab, three workarounds:
  - Chrome pauses rAF and THREE.Timer zeroes delta, so override `document.hidden` and step `renderer._animation._animationLoop(t)` by hand.
  - Yield to the event loop between steps, because pages and fades are promises.
  - WebGL 2 shader compiles poll with rAF, so shim `requestAnimationFrame` with `setTimeout`.

## Measured

- Tests: 293 pass; `pnpm run check` green.
- Night 3 horde reaches its cap of 22 on WebGL 2. Logic plus render submission takes about 0.2 ms per frame; GPU time was not measured.
- Chapter hand-overs checked in Chrome:
  - Night 1 → Day 2 ("Day 2 — The suburbs").
  - Day 2 → wait for dark → Night 2 (fog 50) → Day 3.
  - Night 3 → the ending → credits → home screen, with the save at phase `end`.

## Check by hand (Kartik)

- Real audio: gunshot loudness, the orca's cry, the dawn pad, the final wave.
- Pointer lock: the mouse wheel and 1/2 weapon switch, Esc during the ending, Quit mid-ending, then Continue.
- Pistol viewmodel placement and size.
- Safari.
