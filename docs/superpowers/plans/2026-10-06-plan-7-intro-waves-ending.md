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
