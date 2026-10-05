# Plan 12: Kartik's full play-through (2026-10-05, late)

> SDD with Sonnet implementers. Briefs and ledger: `.superpowers/sdd/2026-10-05-plan-12-full-playthrough/`. Every fix applies to the WHOLE game, not just the scene in the screenshot (Kartik: "relate things, see the bigger picture").

## Issues (K) and where they come from
| K | Issue (Kartik) | Known cause / first look | Task |
|---|---|---|---|
| 1 | Hang at the start (Day 1). Freezes on arrow pickup, crate, wave | First-use shader/pipeline compiles. The night warm-up exists (5efea01) but not for day starts, the ending, or first-use items | W2 |
| 2 | Frame drops: Night 2, Night 3, Day 3 start, the lake last stand ("unplayable"), farewell/sunrise | To profile per scene (long-frame log + pipeline hook) | W2 |
| 3 | Blank black screens while loading (Night 3 to the lake) | No loading indicator on scene switches | W3 |
| 4 | "To exit full screen, press and hold Esc" bubble every time a panel shows, even when not in full screen | Pointer lock re-requested on every resume? Research | W4 |
| 5 | Browser shortcuts must not steal the controls | Keyboard Lock API in full screen + preventDefault | W4 |
| 6 | The orca's jaw spins erratically while eating | `openJaw` multiplies the Jaw bone each frame (fish-strand.ts:18); the mixer skips static bones, so it piles up (the same class as the Z2 sag) | W1 |
| 7 | Hints: explore houses/sheds, feed Dras at the river, more fish = more help, keep following the river | Missing texts | W5 |
| 8 | Every tape scene too dark | Tape 2 lab, tape 3 spillway untouched | W6 |
| 9 | 2 hits kill (Normal, 3 expected) | No invulnerability after a hit (only after the first hint page); stacked hits from two zombies | W7 |
| 10 | Pickups should glow; spread them across the path | No emissive; edge pickups all at `EDGE_X - 0.45` | W5 |
| 11 | No objective after Dras is stranded | Objective line empty in the ending beats | W8 |
| 12 | Farewell hand: a big low-poly arm from the left | Should be a short forearm and five fingers from the lower right | W8 |
| 13 | The dying orca bobs up and down | Strand breathing too strong | W1 |
| 14 | Mom's hand should be next to the player's | Mom reach target vs the player hand spot | W8 |
| 15 | The orca's eye missing by the hand; a ground slab cuts through her ("fractured") | To reproduce | W8 |
| 16 | "You lay your last fish pack beside her": the camera is far away | Pack shot camera position | W8 |
| 17 | Orca waterline inconsistent across beats | Strand / farewell placement | W1/W8 |
| 18 | Sunrise "Let's go home": no instruction, STUCK, no input works | BLOCKER, to reproduce | W8 |
| 19 | Ending animation jittery, jump cuts, no fades | Camera rails / transitions | W8 |
