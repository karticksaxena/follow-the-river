# Plan 6: nights you fight through

**Goal:** Kartik's play-test of Nights 1 and 2 (2026-10-06). Running to the safe spot was too easy, and the night gave you nothing to find. The torch died for good, and the guns sounded flat. Dying sent you back to the start of the night.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md`, plus the rulings below. Kartik's answers are binding.

## Rulings (Kartik, 2026-10-06)

- **Three waves a night.**
  - Nights 1 and 2: three waves.
  - Night 3: two waves in the forest; the lake's ending wave is the third.
- **Barricades.** A barricade across the bank holds you at each wave until its last zombie dies. Then it falls and "The way is clear."
- **Crates.** Each wave starts at a crate, a night pickup. Every crate gives ammo for the guns you own, plus arrows, a spare battery and a fish pack. Some crates also hold a new gun:

  | Night | Wave 1 | Wave 2 | Wave 3 |
  |---|---|---|---|
  | 1 | police pistol | shotgun | refill |
  | 2 | refill | rifle | refill |
  | 3 | refill | refill | — |

  - The Day 2 pistol pickup gives ammo if you already own the pistol.
- **Checkpoints.** Dying restarts at the current wave's start, never the night's start.
  - You come back with full health and minimum supplies: 6 arrows, 1 spare battery, a battery at least 60% full, 1 fish pack, and ammo for each gun you own (pistol 8, shotgun 4, rifle 20).
- **Torch (Alan Wake style).**
  - The charge drains while the torch is on.
  - About 1.5 s after you switch it off, it recharges slowly.
  - Battery pickups become spare batteries, up to 5. **R** puts a fresh battery in.
  - The HUD shows the spares.
- **The orca, fed.** Every fish pack makes it hunt harder: more grabs, shorter waits, further reach, a faster grab and a body sweep. You can feed it at night too (E at the water's edge, same as by day). A hint says so.
- **Running shakes.** A head bob while walking, stronger when sprinting, with a little roll.
- **Sounds.**
  - Real CC0 recordings for the pistol, shotgun and rifle.
  - A better bow shot: CC0 if one exists, else improved procedurally.

## Design notes

- **Save.**
  - `RunSave` version 2 adds:
    - `wave`: how many waves of `phase` are cleared, which is the checkpoint.
    - `guns`: the guns you own, for example `['pistol', 'shotgun']`.
    - New supplies: `cells` (spare batteries), `shells` and `rounds`.
  - `ammo` stays the pistol's ammo.
  - Version 1 saves load: `hasGun` true becomes `guns ['pistol']`.
- **Waves.** `areas/*` get `waves: WaveDef[]`, where `WaveDef = { z, gateZ, count, crate }`.
  - `waves.ts` runs them. A wave starts when you pass z.
  - Zombies spawn in groups of 3 every 2 s, ahead of you and behind, already hunting you.
  - The normal night trickle is off during a night.
  - A wave is clear when nothing is left to spawn and none are alive. Then the gate opens and the checkpoint is saved.
- **Gates.**
  - Props across the strip at `gateZ`: police barriers in the city and suburbs, logs in the forest. They are not batched, so they can fall.
  - Each gate has a collider box. Opening it moves the box out of the world. Every grid holds the same box object, so nothing has to be rebuilt.
  - `reset()` puts it back.
- **Guns.** `Weapon = 'bow' | 'pistol' | 'shotgun' | 'rifle'`, on keys 1–4; the wheel cycles through what you own.

  | Gun | Shots per click | Range | Fire | Ammo |
  |---|---|---|---|---|
  | Pistol | 1 bullet | 40 m | One shot per click | `ammo` |
  | Shotgun | 7 pellets in a cone | 16 m | Slow | `shells` |
  | Rifle | 1 bullet | 50 m | Automatic while held, 0.11 s apart | `rounds` |

- **The orca's style for `fed` packs:**

  | Field | Value |
  |---|---|
  | strikes | 4 + 4·fed |
  | cooldown | max(0.5, 1.1 − 0.12·fed) s |
  | reach | min(7, 4.5 + 0.5·fed) m |
  | pace | max(0.7, 1 − 0.06·fed) |
  | sweep | min(2, 0.4·fed) m |

## Tasks

1. **Assets (agent):** shotgun and rifle viewmodels from Blender (CC0 original). The script goes in `tools/blender/plan6_guns.py`.
2. **Sounds (agent):** CC0 gunshots for the pistol, shotgun and rifle, and a bow shot. They go in `public/assets/sounds/weapons/`, with sources reported for `LICENSES.md`.
3. **Save v2:** guns, wave, new supplies, migration, top-up; with tests.
4. **Weapons:** the gun specs, four slots, shotgun pellets, rifle auto-fire, HUD ammo per gun; with tests.
5. **Torch:** recharge, spares, R; HUD and hint; with tests.
6. **Orca fed style:** night feeding and its hint; with tests.
7. **Waves:** wave defs per area, `waves.ts`, gates, crates as night pickups, checkpoint restart; HUD "Wave 1/3 · 5 left"; with tests.
8. **Head bob;** with a test of the pure function.
9. **Chrome play-through:** every night, a death mid-wave, a resume, and the ending.
