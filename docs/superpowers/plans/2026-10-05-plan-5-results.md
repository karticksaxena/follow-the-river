# Plan 5 results: the story, told in motion

## What shipped

- **Cold open:** a new run opens on an animated prologue, before the intro.
  - Three shots: a dusk drift over the city river; a street corner where the first infected stagger under a streetlight and a car alarm goes off; a push-in on a riverside house with the TV still on.
  - Player-paced captions run between the shots, then the title "Follow the River".
  - It can be skipped, plays once per new run, and quitting mid-shot is clean.
- **A living Mom:**
  - **Intro:** she paces behind the couch while the news plays, glancing at the TV and fidgeting. She walks out of the front door, and an hour later walks back in carrying the fish pack. Outside she leads you to the water's edge, throws, then steps back and raises her phone to film.
  - **Ending:** she fidgets on the shore and backs toward the canoe as the wave comes, her feet following the sloping pebbles. She flinches, then walks up to you for her last lines.
- **Stray-style voices:** Mom, the TV anchor and Mom on tape make wordless vocal sounds, generated per line, while the English shows as the subtitle. Narration stays silent.
- **Tapes as animated flashbacks:**
  - Day 41: the lab at night, with Mom at the bench, the empty mouse cage and the red lamp pulsing.
  - Day 63: Mom at the glowing tank as the young orca turns to her voice.
  - The last tape: Mom on the moonlit bank below the dam as the orca slips away.
  - The HUD hides during each flashback, and your view comes back exactly where it was.
- **The orca:**
  - Its nose and tail stay in the water while it swims; it leaves the water only to take a zombie (see the polish notes below).
  - It helps more each night: 4 strikes plus 4 per fish pack, every 1.1 s, reaching 4.5 m up the bank.
  - In the ending's last stand it strikes every 0.6 s and reaches 7 m.
- **Balance:**
  - Movement: walk 3.2 m/s, sprint 4.8 m/s.
  - Night zombies: 3.8 / 3.9 / 4.0 m/s, and they lunge at 45% of their speed while winding up a blow.
  - A pure sprint survives every night. Zombies ahead of you are still dangerous.
- **Fixes along the way:**
  - The flashbacks rendered black, because the camera's world matrix went stale while it still belonged to the chapter scene.
  - The banks' wheat reeds looked like fins up close, so they were removed.
  - Dev `?nolock` now pauses mouse look and hides the cursor like a real pointer lock.

## Tested (Chrome, WebGPU and `?webgl`)

- A full run: cold open → intro → Day 1 (Tape 1) → Night 1 → Day 2 (the gun, Tape 2) → Night 2 → Day 3 (Tape 3) → Night 3 → the ending → credits → home, with the save at `end`.
- Edge cases:
  - A corrupt save, and Continue at Day 2, Night 2 and the end.
  - Zero arrows, ammo and battery.
  - Esc spam and window resize.
  - Quit mid-night, then Continue.
  - Quit mid cold open.
  - Skipping a tape flashback.
  - Chapter hand-overs.
  - The intro, Day 2 and Night 3 under WebGL 2.
- Automated: 345 tests; `pnpm run check` green.

## Check by hand (Kartik)

- How the voices and the orca's blow sound.
- Pointer lock (the dev link is `?nolock`; the real game is `http://localhost:5173/`).
- Safari.

## Polish after Plan 5 (Kartik's play-test)

- **Quit to dreams:** the home screen showed the last game frame. Leaving home had freed the one geometry three.js shares between every sprite, so each frame failed on the next home visit.
- **Mouse:** the dev `?nolock` link now also takes the real pointer lock on a click (endless 360° turning).
- **Campfire:** the wait spot has a burning fire (flame tongues, a flickering warm light) you sit beside, not in.
- **Jump** on Space; **hearts** in the HUD for the three hits you can take; a **bow shot** that sounds like a string and an arrow, not a pluck.
- **The orca takes zombies off the bank**, like orcas snatching seals off a beach:
  - It rushes in under the water and bursts out over the edge; in the city the railing breaks and flies onto the road.
  - It bites, thrashes with the zombie kicking in its jaws, then crawls back over the ground and drags it under.
  - Feeding still means more grabs a night: 4, plus 4 per fish pack.
  - In the ending's last stand it grabs faster, and its body knocks the zombies beside its jaws into the river. Measured against the old snaps, a player who just stands there still comes through the wave untouched.

## Later

- First-person hands holding the bow and gun.
