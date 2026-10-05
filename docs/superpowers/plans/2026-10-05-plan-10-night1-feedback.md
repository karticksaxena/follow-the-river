# Plan 10 — Kartik's Day 1 / Night 1 play-test feedback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (Sonnet implementers). Each task's full brief lives in `.superpowers/sdd/2026-10-05-plan-10-night1-feedback/task-<id>-brief.md`.

**Goal:** fix everything Kartik found playing plan-9 (2026-10-05) before he plays Night 2 and later.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md` (the game). This plan argues from Kartik's play-test, quoted below.

## Kartik's asks (2026-10-05, condensed from his words)
1. "I never told you to add hands ... remove all the hands." The bow and guns go back "on the right" as before.
2. The Day 1 shed ("It is pitch black in here") "doesn't even look pitch black". A zombie inside is plainly visible.
3. The first tape ("Day twelve ... Subject R-7"): "increase brightness a bit ... but again not too much".
4. Night 1: the torch must matter. Ammo and chests go in dark houses to search, with surprise zombies inside. "Even if I turn off the torch, I can see the zombies."
5. The hint text must say where the ammo is found.
6. The orca kills zombies far ahead and behind, and eats every zombie, so you can cross the night without firing. He wants:
   - She helps near him only.
   - With ammo: she takes some zombies and he must kill the rest.
   - Out of ammo: leading zombies to Dras can kill them all, but the gap between her kills is longer, "so that I have to struggle, run around evading".
   - Feeding makes her more aggressive (check that it works).
7. A headshot kills in one hit on every difficulty. Body shots needed rise with difficulty (Normal 2).
8. More zombies, even on Normal ("too easy, no struggle"), but "a balance: not too easy, not too difficult".
9. Multi-story buildings to shoot from: maybe later ("first do these things").
10. "Take care of any downstream impacts."

## Rulings
- Ruling: full code revert of Z4 (f056f49 arms parts, d4b921c view-light, 5fe1b14), including view-light. Why: "like earlier, the way it was". Cost if wrong: the torch may brighten the gun at night as it did before Z4 (it was never a complaint).
- Ruling: multi-story buildings are deferred. Why: Kartik said do the rest first. Cost if wrong: one more round.
- Ruling: the night outdoor preset stays as it is unless a torch-off Chrome frame between two lamps shows a zombie at about 15 m clearly. Why: he has complained about both "too dark" and "too visible"; dark houses give the torch its job. Cost if wrong: a small preset tweak.
- Ruling: houses reuse the shack builder (ShackDef, bigger sizes), so the dark interiors cover them automatically. Why: one builder; the colliders and door logic are proven. Cost if wrong: houses look like big sheds. A wall-colour variant softens that.
- Ruling: only Night 1 wave sizes change. Nights 2 and 3 keep their sizes but get the new orca rules (global). Kartik plays them next. Cost if wrong: Nights 2 and 3 run harder than tuned until his feedback.
- Ruling: pickups lose their glow inside interiors, so the torch finds them. Why: ask 4. Cost if wrong: a little more searching.

## Tasks
- **P1** No hands; weapons on the right. Done: a3dfcab.
- **P2** Dark interiors (a position-based occlusion mask for the sky light, the sun or moon key and the street lamps, on every quality tier), no pickup glow inside, tape 1 a bit brighter.
- **P3** Combat balance:
  - the orca guards near the player;
  - per-wave share with ammo, slow but unlimited when dry, feeding makes her hungrier;
  - Hard body hits 3;
  - Night 1 waves +40%;
  - the orca hint text.
- **P4** Night 1 houses:
  - dark, enterable, with ammo, arrows, a battery, wave crates and surprise zombies inside;
  - no props or spawns inside the walls;
  - hints say where the ammo is;
  - "How to play";
  - a balance test (supply against the shots needed).
- **P5** Chrome play-test as a player (Story / Normal / Hard, WebGPU + WebGL), frame times, the full check, the results doc.

## Global constraints
CLAUDE.md:
- no per-frame allocation;
- functions under 50 lines, files under 500;
- named constants;
- never bright;
- player-paced text (showPages);
- no em dashes in game text;
- CC0 assets;
- Sonnet subagents;
- explicit-path commits;
- never push;
- never touch :5173.
