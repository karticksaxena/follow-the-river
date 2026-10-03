# Plan 1 follow-ups (input for Plan 2)

**Status after Plan 2:** the "Do first" list below is resolved (see the end of this file for what is still open).

Carried over from the Plan 1 task reviews and the final whole-branch review. None of these blocked the merge. Read this before writing Plan 2.

## Do first in Plan 2 (engine groundwork) — all resolved in Plan 2

- [x] **Scene disposal.** (`engine/dispose.ts`) Add a `disposeScene(scene)` engine helper and use it on home↔dream and area changes. Today each round trip leaks the bedroom's own geometry, its two canvas textures and the lamp's shadow map. Dream scenes and the cloud textures are never disposed either. Cached GLB geometry is shared, so skip it.
- [x] **Swap-world helper.** (`session.ts`) Move the save-previous-scene/camera → fade → loading text → restore-on-failure pattern out of `app.ts` into one helper. `runDream` is over the 50-line rule.
- [x] **Audio channels.** (channels, pause, positional) Named channels (ambience, sting, positional), with pause/duck tied to `isPaused`. The sting currently keeps playing for up to 1.4 s after pausing or quitting. Resume the AudioContext when Safari interrupts it after a tab switch.
- [x] **Dream contract.** (read `onDone`, `choose`, `finish`, `begin`) Add optional `onPause` / `onResume`, and a typed `fail()` so dreams can report errors without throwing.
- [x] **Day/night presets.** Drive light colours and intensities from one data object. Avoid changing `visible` or the light count at runtime, because that can recompile shaders. The flashlight toggle should change intensity, not `visible`.
- [x] **Zombies at scale.** (spatial grid, shared materials, shadow caps)
  - Share one material per zombie type. Use InstancedMesh or clone sharing.
  - Only near objects should cast flashlight shadows. The ~130 skyline clones currently all cast.
  - Add a spatial grid before putting many boxes into `resolveCircle`, which resolves boxes one after another and only checks each once.
  - Use per-entity scratch vectors in hot loops.
- [x] **Asset URLs.** Build them from `import.meta.env.BASE_URL` in case the site is ever hosted under a sub-path.
- [x] **Progress saves.** Save nights survived per dream through the existing `createSaveStore`.

## Small fixes worth doing when nearby

- `litFrom` drops `alphaTest`, `alphaMap` and `depthWrite`. Fix this before using foliage or fence cutouts.
- `loadDream` and `tryStage` swallow the original error, so add a dev-only report. A syntax error currently looks like "offline".
- The watcher's post-strike updater keeps rewriting `visible`, roll and intensity forever. Stop it once the flicker ends.
- A dropped (throwing) updater stays dead for the rest of the dream. Consider showing a message.
- Pausing mid-jolt leaves the camera rolled until resume.
- A `lock-error` while the pause menu is already open rebuilds it, which loses slider focus and the How-to-play toggle.
- `tweenCamera` needs a guard for `seconds <= 0`, and it never resolves if the stage stops.
- `rise()` failures (tween or audio) after `startHome` returns aren't caught by `goHome`.
- The load and start timeouts are separate, so the worst case before the failure message is about 40 s.
- The skyline's buildings can overlap, and `Silhouette.width` is unused for buildings.
- The river's mud edge may z-fight far away.

## Test gaps

- `loadModel` cache, clone and eviction
- `AudioBus.once`
- The `clamp` NaN/Infinity branch in settings
- Late-event cases in home `flow`
- `addSkyline` placement

## Decisions that stand

- **Stay on TypeScript 6.** TypeScript 7 ships no `tsserver.js`, which the typescript-lsp plugin needs.
- **`player.update` allocations are fine.** It runs once per frame and the objects are tiny. Revisit when zombies run per-entity loops.
- **All subagents run on Sonnet** (the user's rule).

## Still open after Plan 2

- Kartik checks by hand: real audio levels with headphones, Safari, pointer lock.
- `batch.ts` minors (parked from review).
- Intro TV-screen legibility.
- `isRunSave` does not cap counts at `SUPPLY_LIMITS`; `spend()` accepts negative amounts (unreachable today).
- Node-material uniforms and skeleton textures are not freed on dispose (fine for current assets).
- Flashlight minors: orient arrow before first-frame stick; `fire()` is a silent no-op when not ready.
- Ambience holds its level while the "You died" page is paused.
- Shack roof slope sign/comment; possible thin sky slit on the high side.
- Still from the small-fixes list above unless noted: `litFrom` alphaTest, swallowed dream-load errors, watcher updater, `tweenCamera` guards, load/start timeouts.
