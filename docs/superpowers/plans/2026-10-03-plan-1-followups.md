# Plan 1 follow-ups (input for Plan 2)

Carried over from the Plan 1 task reviews and the final whole-branch review. None of these blocked the merge. Read this before writing Plan 2.

## Do first in Plan 2 (engine groundwork)

- **Scene disposal.** Add a `disposeScene(scene)` engine helper and use it on home↔dream and area changes. Today each round trip leaks the bedroom's own geometry, its two canvas textures and the lamp's shadow map. Dream scenes and the cloud textures are never disposed either. Cached GLB geometry is shared, so skip it.
- **Swap-world helper.** Move the save-previous-scene/camera → fade → loading text → restore-on-failure pattern out of `app.ts` into one helper. `runDream` is over the 50-line rule.
- **Audio channels.** Named channels (ambience, sting, positional), with pause/duck tied to `isPaused`. The sting currently keeps playing for up to 1.4 s after pausing or quitting. Resume the AudioContext when Safari interrupts it after a tab switch.
- **Dream contract.** Add optional `onPause` / `onResume`, and a typed `fail()` so dreams can report errors without throwing.
- **Day/night presets.** Drive light colours and intensities from one data object. Avoid changing `visible` or the light count at runtime, because that can recompile shaders. The flashlight toggle should change intensity, not `visible`.
- **Zombies at scale.**
  - Share one material per zombie type. Use InstancedMesh or clone sharing.
  - Only near objects should cast flashlight shadows. The ~130 skyline clones currently all cast.
  - Add a spatial grid before putting many boxes into `resolveCircle`, which resolves boxes one after another and only checks each once.
  - Use per-entity scratch vectors in hot loops.
- **Asset URLs.** Build them from `import.meta.env.BASE_URL` in case the site is ever hosted under a sub-path.
- **Progress saves.** Save nights survived per dream through the existing `createSaveStore`.

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
