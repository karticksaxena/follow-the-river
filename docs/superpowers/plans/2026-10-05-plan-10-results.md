# Plan 10 results — Kartik's Day 1 / Night 1 play-test feedback

Plan: `2026-10-05-plan-10-night1-feedback.md`. Branch `plan-9` (local only, never pushed).

## What changed
| Kartik's ask | What shipped | Commit |
|---|---|---|
| No hands; bow and guns on the right | Full revert of the Plan 9 arms (code, GLB, Blender script, view-light) | a7f31f3 |
| The Day 1 shed is not pitch black | An interior occlusion volume masks the sky light, image light and sun/moon inside every shed and house, on every quality tier; door spill keeps the doorway readable | c5eb12a |
| Headshots | Headshots never counted: the head sphere floated 0.4 m above hunched runners. It now sits on each zombie's real Head bone | d826a9d |
| Orca eats everything, far from you | She takes only zombies within 7 m of you (Normal). With ammo: about 30% of each wave (4/5/6 on Night 1). Dry: unlimited but 9-13 s apart. Feeding: hungrier, +2 to the wave | 13ec8ca |
| Body hits rise with difficulty | Story 1, Normal 2, Hard 3; a head hit always kills | 13ec8ca |
| Too easy on Normal | Night 1 waves 9/12/15 → 13/17/21 (caps 7/9/11) | 13ec8ca |
| Torch must matter; ammo in houses; hints say where | 6 dark houses on Night 1 (2 per wave) hold ammo, arrows, a battery and each wave's crate, with 1-2 sleepers each (extras, they never block the barricade). Zombies use the doors. Hints, objective line and How to play updated | bcb7929 |
| Tape 1 a bit brighter | Tank ambient 0.35 → 1, tank light 7 → 12 | 23ba3d5 |
| Zombies visible with the torch off | Moon rim on zombies 0.22 → 0.1 and gone indoors | 23ba3d5 |
| (perf, found in testing) | Pickups cast no shadows and draw only within 40 m: Night 1 draws 1091 → 490 (Medium) | d0748e7 |

## Verified in Chrome (frozen builds, Normal)
- Day 1 shed s1, torch off: mean luminance 0.12 → 0.015, so it now reads pitch black. Torch on: the lurker shows in the beam. From outside, by day, the sheds look normal (street mean 0.30).
- Night 1 house 1:
  - from the road with the torch, the crate and a lying sleeper show through the door;
  - with the torch off, it is black;
  - inside with the torch on, the sleeper rises (a surprise);
  - zombies leave and enter through the door (a tracked path follows the wall to the doorway).
  - WebGL: the house is black with the torch off, and the crate shows in the beam.
- Headshots: rays at the visible head of standing and chasing zombies register as head hits at 3, 5 and 59 m; rays 0.5 m lower register as body hits.
- Orca, Night 1 wave 1, walking without firing:
  - armed: exactly 4 kills (the budget), 6-8 s apart, each seized 2.8-3.1 m from the player;
  - dry (0 arrows, no guns): kills at 94, 106, 118 and 131 s (12-13 s apart), all beside the player.
- Hints: "The crate is in one of the houses here: take your flashlight." The objective reads "Kill them all. Search the houses for ammo. The barricade falls when the wave is dead."
- Frame times on the M3 Pro, Night 1, 8 zombies alive (the lock-screen video was running, so the numbers are noisy), median ms:
  - Low 5.0;
  - Medium 9.7;
  - High 9.9.
  - With no zombies: Low 4.0, Medium 7.1, High 7.9.
- Nights 2 and 3 smoke (1ed1fb2, Normal, wave 1): no errors; the orca armed 3 (Night 2) and 4 (Night 3) = 30% of the wave, seized zombies 2.9-4.9 m from the player; zombies chase normally.
- Full check: 112 files, 838 tests.

## Balance (Normal, pure test `balance.test.ts`)
Shots supplied ÷ shots needed (the player's kills × 1.6):
- Night 1 waves: 1.67, 2.40 and 2.00, asserted to stay between 1.3 and 2.5.
- Nights 2 and 3 have no houses and are reported only: 2.5 to 4.4. They are more generous on paper, but the orca now takes a smaller share there too. Kartik plays them next.

## Known gaps and deferred items
- The houses reuse the shed builder (plank walls, a door, no windows): they read more like garages or stores than homes. Windows, a porch or a second wall colour are a quick upgrade if wanted.
- Pickups beyond 40 m are not drawn (Day 1 street pickups pop in at 40 m; one knob, `SHOW_RANGE`).
- Multi-story buildings (deferred, Kartik's call).
- Nights 2 and 3 keep their wave sizes. The new orca rules apply there, so they will feel harder. Tune after Kartik's play-test.
- Since Night 1 now shows its own crate hint, the "Find the crate" hint appears at Night 2's first wave.
- Minors from the reviews:
  - sleepers missed in an earlier wave stay asleep, waking only within 4 m;
  - the house x is duplicated as a literal;
  - there are no unit tests for the sleeper lay/wake counts (the horde needs GLB assets);
  - a lying zombie at 40 m takes a body hit before a head hit.
- Process note: during P4, two uncommitted controller edits vanished from disk (probably reset by the implementer). They were re-applied and committed. Commit before dispatching.
