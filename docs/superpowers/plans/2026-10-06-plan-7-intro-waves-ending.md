# Plan 7: intro fixes, spread-out waves, and a new ending

**Goal:** Kartik's play-test after Plan 6 (2026-10-06), with his interview answers as rulings.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md`, plus the rulings below.

## Rulings (Kartik, 2026-10-06)

1. **Intro living room.** The TV screen pokes out through the house's window, and "something is pretty off with that scene". Fix the layout. Mom's fish pack must sit in her hands, not float between them.
2. **No em dashes in game text.** Use a plain hyphen.
3. **Waves spread through the zone.** Each wave is 3–4 ambushes set off along the zone: out of a side street, from behind a car, "corpses" on the road that get up, and a few from behind you. The barricade still needs every one of them dead.
4. **Why the orca dies: poisoned, then a last stand.**
   - Every zombie it eats carries the virus Mom's lab made, so it gets sicker each night: darker, scarred, slower, with a red-tinged blow. Tape 3 foreshadows this.
   - At the lake a horde too big for you comes, and **you fight it alongside the orca**. You get a crate full of ammo, and the orca leaps again and again.
   - Its last leap strands it on the pebble shore, too sick to get back into the water. Mom: "It was eating the sickness for us."
5. **The farewell (all three).**
   - Mom hums the call from the lab (Tape 2), and it answers once, softly.
   - You put your hand on its side (E), and Mom's hand is beside yours.
   - You lay your last fish pack on the water (E). Then it is still.
6. **The canoe ride.**
   - Mom rows you down the river into a lush green forest at sunrise. This is the game's first real colour, a deliberate exception to "never bright".
   - You can look around with the mouse.
   - A small fin surfaces beside the canoe (its calf) and follows you. Mom smiles.
   - Then the credits.

## Tasks (parallel; each owns its files)

- **A. Intro fixes (Sonnet agent):** `intro-scene.ts`, `intro.ts`, `mom-actor.ts` (+ test), `tools/blender/dream1_props.py`, `props/{tv,livingroom}.glb`.
- **B. Canoe ride (Sonnet agent):** new `canoe-scene.ts` and `canoe-ride.ts` (+ tests). The interface is `playCanoeRide(ctx, sounds): Promise<void>`.
- **C. Ambush waves (Sonnet agent):** `waves.ts` (+ test), the `areas/*` wave blocks and `WaveDef` in `areas/types.ts`, and `tickWaves`/`spawnWave` in `play.ts`.
- **D. Ending, sickness, tapes (controller):** `ending.ts`, `ending-scene.ts`, `fish*.ts`, `orca-grab.ts`, `tapes.ts`, `hints.ts`. Then the em dashes across all text, wiring in the canoe ride, the full check, and a Chrome play-through.

## Results (2026-10-06)

All tasks shipped. `pnpm run check` passes with 401 tests.

**Played through in Chrome on :5177:**
- **Ambush waves (Night 1, wave 1).** Ambushes go off along the zone as you walk: a street group ahead of the crate, two "corpses" on the road at z −171 and −173 that get up, and one from behind. The counter only ever goes down.
- **The last stand.**
  - Mom's lines; she arms you (a pistol if you had none, full ammo, 20 arrows, +2 spare batteries).
  - A 30-zombie horde comes. In about 23 s the orca had made 8 grabs and the rest were killed.
  - Its last leap strands it on the pebbles beside Mom (sickness 1: blotched grey-pink).
- **The farewell.**
  - "It was eating the sickness for us."
  - Mom's song, and its answer.
  - "E: put your hand on it" (the torch switches off so it doesn't glare), then Mom's hand.
  - "E: lay your last fish pack on the water", then "It breathes out once... Then it is still."
  - Dawn, then "Let's go home."
- **The canoe ride.** A sunrise forest river with reflections. Turning around shows Mom rowing (her paddle now crosses at her hands). The calf swims beside the canoe, black and white (its own materials, so not tinted sick).
- **The end.** The closing pages, the credits, home. The save is `end`.
- **Intro and cold open.** The agent checked them in screenshots: the cold open's TV glow is now inside the house's real window, and Mom holds the pack in her palm.

**Fixed during play-test:** the "hand on it" spot was beside the orca's middle at the water line, past the shore wall, so it moved up by its head. A test now checks both E spots are reachable. The wave counter is hidden during the ending. The torch is off for the farewell.

**Kartik checks by hand:** how the fight feels, the song and the cries (audio), and the canoe ride's pacing (72 s).
