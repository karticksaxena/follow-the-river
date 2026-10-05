# Kartik's Dreams — project rules

Short first-person horror games made from Kartik's real dreams, played in desktop browsers.
Design: `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md`. Plans: `docs/superpowers/plans/`.

## Core rules (from ~/Code/base-repo-ts)

1. **BE CRITICAL** — challenge bad ideas, point out flaws
2. **PERFORMANCE FIRST** — it's a real-time game: no per-frame allocations in hot loops, avoid O(n²)
3. **MODULAR** — functions < 50 lines, files < 500 lines
4. **READ CONTEXT FIRST** — use `LSP` (`findReferences`) before changing a shared symbol
5. **ASK WHEN UNCLEAR** — never guess
6. **DRY / YAGNI / KISS** — add a file, dependency or abstraction only when a feature needs it

## Stack and commands

Vite + TypeScript (strict) + three.js `WebGPURenderer` (WebGL 2 fallback), pnpm only, Node `lts/*`.

```bash
pnpm install
pnpm run dev       # http://localhost:5173  (?webgl forces WebGL 2; ?nolock = dev-only: plays on when pointer lock is refused)
pnpm run check     # lint + typecheck + format:check + test + build — must pass before every commit
pnpm run audit
```

Tooling mirrors `~/Code/base-repo-ts/SETUP.md`: oxlint type-aware (`.oxlintrc.json`), Prettier + organize-imports, `tsc --noEmit`, Vitest. Never add ESLint/Jest/Biome.

## Game rules

- **Imports:** three core from `three/webgpu`; addons from `three/addons/...js`. No `three` alias (both builds share `three.core.js`).
- **Never bright:** dark sky/fog colours, dim lights; even "day" is overcast. Light and fog values are named constants (tuning knobs).
- **No world edge:** sky dome + ground/water running far past the play area + distant silhouettes, ended by fog — never a visible cliff or void.
- **Player-paced text:** tutorials, hints, story subtitles use `showPages` — never timers. Enter/→/Space next, ←/Backspace back, Skip.
- **Desktop only:** keyboard + mouse; full screen on Start; touch-only devices get the "play on a computer" screen.
- **Saves:** only through `createSaveStore` (`kartiks-dreams:` prefix); blocked or corrupt storage must never crash.
- **DOM:** text via `textContent` / `el()` — never `innerHTML` with dynamic strings. No `console` in committed code.
- **Assets:** CC0 for art/sound; fonts are OFL/Apache via @fontsource — everything listed in `public/assets/LICENSES.md` (source URL + licence). Kenney GLBs are unlit — load through `loadModel` (it relights them).
- **Versions:** never hardcode versions in docs; install `@latest` stable and check `pnpm view <pkg> dist-tags` for prereleases. TypeScript must be a major that ships `lib/tsserver.js` (the typescript-lsp plugin needs it).

## Agents

- Use the `grounded-research` skill before adding/upgrading a dependency, picking an asset pack, or using an API you haven't verified in `node_modules`.
- Subagents run on Sonnet only (`model: "sonnet"`).
- Browser checks: Claude in Chrome on `http://localhost:5173/?nolock` and `?nolock&webgl`; `window.kd` (dev only) exposes the app. Pointer lock and audio need a real click, so Kartik checks those and Safari by hand.
- Rebuild assets (zombies, orca, props, sounds) with `tools/assets/README.md`.
- Play-test: `?nolock`, `?phase=intro|day1|…|night3`, `?webgl`; `window.kd` and `window.kdRiver` (dev). Hidden tab: Chrome pauses rAF and THREE.Timer zeroes delta — override `document.hidden` and step `renderer._animation._animationLoop(t)` by hand, `await` between stepped seconds (pages/fades are promises), and shim `requestAnimationFrame` with `setTimeout` for `?webgl` (its shader compile polls rAF).
- Frozen play-test build (the dev server tracks moving WIP): from plan-9, create a detached worktree at `.claude/worktrees/<name>` pinned to a commit sha (`git worktree add --detach`), run `pnpm install --frozen-lockfile --prefer-offline` there, then `pnpm exec vite --port N --strictPort`. Remove it when done.
- `window.kdRun` (dev) is the live run: `kdRun.cutscene` (true hides HUD/weapons and holds input), `kdRun.interact`.
- `?webgl` screenshots: `preserveDrawingBuffer` is false, so `drawImage` the canvas into an overlay canvas right after a stepped frame. A first screenshot after a long JS call is often black; step ~5 frames in a separate call first.
- A background tab throttles `setInterval` and rAF: drive game time by stepping frames, never wait on timers. With the display asleep Chrome throttles timers to about once a minute: replace `setTimeout`/`setInterval`/rAF with a virtual clock queue fired by the frame stepper (overwrite them right after navigation, before clicking Start).
- Luminance probe: read the canvas after a stepped frame, report mean sRGB luminance and the crushed share (pixels below ~0.05). Plan 9 targets: day >= 0.28 mean / <= 10% crushed, nights 0.08-0.11 / <= 55%.
- Blender: headless (`/Applications/Blender.app/Contents/MacOS/Blender --background --python …`) or the project Blender MCP (`.mcp.json`) for converting/posing models.
