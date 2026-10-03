# Plan 1 — Foundation & Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable shell for Kartik's Dreams. You see a dark bedroom home screen where Kartik sleeps and Z's rise, press Start (fullscreen), float up into a dream cloud and pick "Follow the River". After a content warning and player-paced intro pages, you walk a fogged grey-box riverbank in first person with a flashlight. Pause, settings and quit work.

**Architecture:** One Vite app at the repo root, plain TypeScript, no UI framework. `src/engine/` holds the shared pieces: renderer stage, input, player and collisions, saves, audio, menus and model loading. `src/home/` is the bedroom and dream picker. `src/dreams/` holds the registry and one lazily `import()`ed folder per dream. Pure logic (math, state machines, saves) is unit-tested with Vitest. Rendering and flow are checked in Chrome on both renderer backends.

**Tech Stack:** Vite, TypeScript (strict), three.js `WebGPURenderer` (auto WebGL 2 fallback), Vitest, oxlint (type-aware), Prettier + organize-imports, pnpm. Kenney Furniture Kit (CC0) models.

**Spec:** `docs/superpowers/specs/2026-10-03-kartiks-dreams-design.md`

**Evidence:** Every code block below was lint-, type- and test-checked (83 tests) in a scratch prototype on 2026-10-03, then run in Chrome on WebGPU and `?webgl`. Copy the code exactly. If a newer package version breaks it, fix the code; don't drop the check.

## Global Constraints

- pnpm only. Install packages without versions (latest stable), then confirm `pnpm view <pkg> dist-tags` shows no prerelease as `latest`. **Never write version numbers into docs, plans or CLAUDE.md.**
- TypeScript: use the major that `create-vite`'s `vanilla-ts` template pins. It must ship `node_modules/typescript/lib/tsserver.js` (the typescript-lsp plugin needs it; TypeScript 7+ has none).
- Tooling mirrors `~/Code/base-repo-ts/SETUP.md`:
  - oxlint `--type-aware --deny-warnings`
  - Prettier (`singleQuote`, `trailingComma: all`, `printWidth: 100`, organize-imports)
  - `tsc --noEmit` with `strict: true`
  - Vitest
  - `.nvmrc` = `lts/*`
  - No ESLint, Jest or Biome.
- `pnpm run check` (lint + typecheck + format:check + test + build) must pass at the end of every task, before its commit.
- Imports: three core from `three/webgpu`; addons from `three/addons/<path>.js`. No `three` → `three/webgpu` alias.
- Functions < 50 lines, files < 500 lines. Explicit return types. No `any`, no floating promises, no unsafe type assertions, no `console`.
- DOM text only via `textContent`/`el()`, never `innerHTML` with dynamic strings.
- **Never bright:** scene backgrounds and fog stay dark; lights dim; tuning values are named constants.
- **No world edge:** every outdoor scene has a sky dome, ground and water running far past the walkable area, and distant silhouettes, all ended by fog.
- **Player-paced text:** intro, hints and story text use `showPages`. Never timers. Enter/→/Space = next, ←/Backspace = back, Skip button.
- Desktop only (keyboard + mouse). Start enters fullscreen. Touch-only devices see "play on a computer".
- Saves only through `createSaveStore` (prefix `kartiks-dreams:`).
- Assets: CC0 only, each listed in `public/assets/LICENSES.md`.
- Use the `grounded-research` skill at every step marked 🔎.
- Subagents run on Sonnet only (`model: "sonnet"`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Steps marked **[controller]** need Claude in Chrome and run in the main session, not a subagent. Steps marked **[Kartik]** are manual checks by the user (real pointer lock, audio, fullscreen, Safari).

## Review Focus

1. **Browser storage blocked or throwing** (Safari private mode, sandboxed iframe, quota full): the game starts with default settings and never crashes. Pinned by `never throws when storage throws` and `works when there is no storage at all` (Task 3).
2. **Corrupt or hand-edited saves** (bad JSON, wrong types, out-of-range numbers): load as defaults or get clamped back into range. Pinned by `returns null for corrupt JSON`, `returns null for data of the wrong shape` and `clamps tampered values into range` (Task 3).
3. **Pointer lock refused** (automated or unfocused window, or a re-lock too soon after Esc): the pause menu stays up so the player can click Resume again. No unhandled rejection. Pinned by `keeps the pause menu up when the lock is refused` (Task 4) and the catch in `player.lock()` (Task 5).
4. **Huge frame gap after switching tabs:** the game advances at most 0.1 s, so the player never teleports through walls. Pinned by `clamps the huge gap after a tab switch` (Task 2).
5. **Touch-only phone or tablet:** shows "Please play on a laptop or desktop computer." Pinned by `rejects a touch-only phone or tablet` (Task 4).

Also covered: a dream whose code fails to download returns to the cards with a message (Task 8 `turns a failed download into a message naming the dream`; Task 10 `returns to the dream cards when loading fails`).

## File map

| File | Responsibility |
|---|---|
| `src/engine/resolution.ts` | Low-res render size for the pixelated look |
| `src/engine/time.ts` | Frame-time clamp |
| `src/engine/stage.ts` | Shared renderer, camera, scene slot, update loop, resize, backend flag |
| `src/engine/save.ts` | Crash-proof `localStorage` wrapper |
| `src/engine/settings.ts` | Sensitivity/volume, validation, clamping |
| `src/engine/device.ts` | Desktop-or-not check |
| `src/engine/lock.ts` | What screen to show after a pointer-lock change |
| `src/engine/pager.ts` | Player-paced page state + reading keys |
| `src/engine/ui.ts` | DOM helpers + overlay (fade, panel) |
| `src/engine/fullscreen.ts` | Enter/toggle fullscreen |
| `src/engine/menus.ts` | Unsupported screen, message, pages reader, pause menu |
| `src/engine/input.ts` | Held/pressed keys |
| `src/engine/movement.ts` | WASD intent → ground-plane step |
| `src/engine/collide.ts` | Circle-vs-box push-out |
| `src/engine/player.ts` | First-person walker (pointer lock + collisions) |
| `src/engine/audio.ts` | Audio listener, unlock, volume, procedural room tone |
| `src/engine/models.ts` | GLB loading, cache, unlit→lit material swap |
| `src/engine/sky.ts` | Gradient sky dome |
| `src/engine/post.ts` | Bloom, vignette and film grain on top of the render |
| `src/engine/scare.ts` | Scare kit: sting sound, camera jolt, light flicker |
| `src/home/breath.ts` | Quiet sleep-breathing loop for the home screen |
| `src/dreams/types.ts` | `DreamInfo`, `DreamContext`, `DreamModule` |
| `src/dreams/registry.ts` | List of dreams |
| `src/dreams/load.ts` | Safe dream loading |
| `src/dreams/follow-the-river/*` | Riverbank (grey-box ground, Blender-built skyline), flashlight |
| `tools/blender/river_props.py` | Headless Blender script that builds the river scenery and the watcher figure GLBs |
| `src/home/*` | Bedroom, Zzz, dream cloud, home flow |
| `src/app.ts` | Runs a dream: player, pause menu, reader |
| `src/main.ts` | Boot |

---

### Task 0: First commit on `main` [controller — ask Kartik first] ✅ done (`0689702`)

The repo has no commits, and worktrees need one. **Ask Kartik before committing.**

**Files:**
- Create: `.gitignore`
- Commit (already present): `docs/`, `.mcp.json`, `.claude/skills/`

- [ ] **Step 1: Write `.gitignore`**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
*.tsbuildinfo

# Tests
coverage/

# Env — commit only .env.example
.env
.env.*
!.env.example

# Logs
*.log

# Caches
.cache/
.vercel/

# Claude Code: personal settings stay local (skills, .mcp.json and settings.json are shared)
.claude/settings.local.json
.claude/worktrees/

# Editor / OS
.DS_Store
.idea/
*.swp
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
!.vscode/tasks.json

# Superpowers SDD scratch (ledger, briefs, review packages)
.superpowers/
```

- [ ] **Step 2: Confirm `.claude/settings.local.json` is ignored and nothing personal is staged**

Run: `git add -A && git status --short`
Expected: `.gitignore`, `.mcp.json`, `.claude/skills/webgpu-threejs-tsl/...`, `docs/superpowers/...`. No `settings.local.json`.

- [ ] **Step 3: Commit (after Kartik says yes)**

```bash
git commit -m "chore: add design spec, plan, project skills and Blender MCP config" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Scaffold, tooling and the first unit

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `.oxlintrc.json`, `.prettierrc`, `.prettierignore`, `.nvmrc`, `.vscode/extensions.json`, `.vscode/settings.json`, `.vscode/tasks.json`, `CLAUDE.md`, `src/style.css`, `src/main.ts` (temporary), `src/engine/resolution.ts`
- Test: `src/engine/resolution.test.ts`

**Interfaces:**
- Produces: `internalResolution(viewWidth: number, viewHeight: number, targetHeight: number): Resolution` where `Resolution = { width: number; height: number }`.
- Produces: `pnpm run check` script used by every later task.

- [ ] **Step 1: 🔎 Grounded check of the stack**

Run:
```bash
for p in vite create-vite three @types/three oxlint oxlint-tsgolint prettier prettier-plugin-organize-imports vitest; do printf "%s " $p; pnpm view $p dist-tags.latest; done
```
Expected: one stable version per package (no `-rc`, `-beta`, `-alpha`, `-canary`). If one is a prerelease, use the newest stable version of that package and note why in the commit message.

- [ ] **Step 2: Scaffold into a temp folder and copy the three files we keep**

```bash
pnpm dlx create-vite@latest /tmp/kd-scaffold --template vanilla-ts --no-interactive --no-immediate
cp /tmp/kd-scaffold/package.json /tmp/kd-scaffold/tsconfig.json .
rm -rf /tmp/kd-scaffold
```

(Never run `create-vite` with `--overwrite` in the repo. It would delete `docs/` and `.claude/`.)

- [ ] **Step 3: Turn on strict mode**

The scaffold's `tsconfig.json` is JSONC with comments and no `strict`. Insert one line after `"noEmit": true,`:

```bash
sed -i '' 's/"noEmit": true,/"noEmit": true,\n    "strict": true,/' tsconfig.json && grep -n '"strict": true' tsconfig.json
```
Expected: one line printed.

- [ ] **Step 4: Install dependencies**

```bash
pnpm install
pnpm add three
pnpm add -D @types/three oxlint oxlint-tsgolint prettier prettier-plugin-organize-imports vitest
test -f node_modules/typescript/lib/tsserver.js && echo "tsserver ok"
```
Expected: `tsserver ok`. If it's missing, the scaffold pinned a TypeScript major without `tsserver.js`. Run `pnpm add -D "typescript@<previous major>"` and re-check.

- [ ] **Step 5: Replace `package.json` name and scripts**

Set `"name": "kartiks-dreams"` and replace the whole `"scripts"` object with:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "lint": "oxlint --type-aware --deny-warnings",
  "lint:fix": "oxlint --type-aware --fix",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:watch": "vitest",
  "audit": "pnpm audit --audit-level=high",
  "check": "pnpm run lint && pnpm run typecheck && pnpm run format:check && pnpm run test && pnpm run build"
}
```

- [ ] **Step 6: Write the tool configs**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // three.js alone is ~850 kB minified; each dream is already split out with import().
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
  },
});
```

`.oxlintrc.json` (the base repo's frontend rules without the React/Next/a11y plugins; `.claude/` holds skill example JS we must not lint):
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "import", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "env": {
    "browser": true
  },
  "rules": {
    "typescript/no-explicit-any": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/explicit-function-return-type": [
      "error",
      {
        "allowExpressions": true,
        "allowTypedFunctionExpressions": true
      }
    ],
    "eslint/no-eval": "error",
    "eslint/no-implied-eval": "error",
    "typescript/no-implied-eval": "error",
    "eslint/no-new-func": "error",
    "eslint/no-script-url": "error",
    "eslint/no-proto": "error",
    "eslint/no-caller": "error",
    "eslint/no-console": "error",
    "import/no-unassigned-import": [
      "warn",
      {
        "allow": ["**/*.css"]
      }
    ]
  },
  "ignorePatterns": ["node_modules/", "dist/", "coverage/", ".claude/"]
}
```

`.prettierrc`:
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-organize-imports"]
}
```

`.prettierignore`:
```text
pnpm-lock.yaml
dist
coverage
.claude
docs
public/assets
```

`.nvmrc`:
```text
lts/*
```

`.vscode/extensions.json`:
```json
{
  "recommendations": ["oxc.oxc-vscode", "esbenp.prettier-vscode"]
}
```

`.vscode/settings.json`:
```json
{
  "npm.autoDetect": "off",
  "js/ts.tsdk.path": "node_modules/typescript/lib",
  "js/ts.tsdk.promptToUseWorkspaceVersion": true,
  "oxc.typeAware": true,
  "oxc.path.tsgolint": "node_modules/.bin/tsgolint"
}
```

`.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "dev",
      "type": "shell",
      "command": "pnpm run dev",
      "problemMatcher": []
    },
    {
      "label": "lint",
      "type": "shell",
      "command": "pnpm run --silent lint --format unix",
      "problemMatcher": [
        {
          "owner": "oxlint",
          "source": "oxlint",
          "fileLocation": ["relative", "${workspaceFolder}"],
          "pattern": {
            "regexp": "^(.+?):(\\d+):(\\d+): (.*) \\[(Error|Warning)/(.+)\\]$",
            "file": 1,
            "line": 2,
            "column": 3,
            "message": 4,
            "severity": 5,
            "code": 6
          }
        }
      ]
    },
    {
      "label": "typecheck",
      "type": "shell",
      "command": "pnpm run typecheck",
      "problemMatcher": ["$tsc"]
    },
    {
      "label": "format",
      "type": "shell",
      "command": "pnpm run format:check",
      "problemMatcher": []
    },
    {
      "label": "test",
      "type": "shell",
      "command": "pnpm run test",
      "problemMatcher": []
    }
  ]
}
```

- [ ] **Step 7: Write `CLAUDE.md` (project rules for every agent)**

````markdown
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
pnpm run dev       # http://localhost:5173  (?webgl forces WebGL 2; ?nolock = dev-only play without pointer lock)
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
- **Assets:** CC0 only; every file listed in `public/assets/LICENSES.md` (source URL + licence). Kenney GLBs are unlit — load through `loadModel` (it relights them).
- **Versions:** never hardcode versions in docs; install `@latest` stable and check `pnpm view <pkg> dist-tags` for prereleases. TypeScript must be a major that ships `lib/tsserver.js` (the typescript-lsp plugin needs it).

## Agents

- Use the `grounded-research` skill before adding/upgrading a dependency, picking an asset pack, or using an API you haven't verified in `node_modules`.
- Subagents run on Sonnet only (`model: "sonnet"`).
- Browser checks: Claude in Chrome on `http://localhost:5173/?nolock` and `?nolock&webgl`; `window.kd` (dev only) exposes the app. Pointer lock and audio need a real click, so Kartik checks those and Safari by hand.
- Blender: headless (`/Applications/Blender.app/Contents/MacOS/Blender --background --python …`) or the project Blender MCP (`.mcp.json`) for converting/posing models.
````

- [ ] **Step 8: Write the page shell and styles**

`index.html` (replace the scaffold's if one was copied):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Short first-person horror games made from real dreams." />
    <title>Kartik's Dreams</title>
  </head>
  <body>
    <div id="app"></div>
    <div id="overlay"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:
```css
:root {
  color-scheme: dark;
  --ink: #e8e6f0;
  --dim: #a9a6b8;
  --panel: rgba(8, 9, 16, 0.86);
  --accent: #b9a8ff;
}
html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #000;
  color: var(--ink);
  font:
    20px/1.5 Georgia,
    'Times New Roman',
    serif;
}
canvas {
  display: block;
  width: 100vw;
  height: 100vh;
  image-rendering: pixelated;
}
#overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.fader {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  transition-property: opacity;
}
.fader.black {
  opacity: 1;
}
.panel.low {
  top: auto;
  bottom: 24px;
  transform: translateX(-50%);
}
.panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  box-sizing: border-box;
  padding: 28px 32px;
  background: var(--panel);
  border: 1px solid #2a2840;
  border-radius: 12px;
  pointer-events: auto;
  text-align: center;
}
h1 {
  margin: 0 0 12px;
  font-size: 2rem;
  font-weight: normal;
  letter-spacing: 0.04em;
}
h1.title {
  font-size: 2.6rem;
}
.big,
.page-text {
  font-size: 1.35rem;
}
.page-text {
  min-height: 4.5em;
  margin: 0 0 8px;
}
.page-count,
.keys {
  color: var(--dim);
  font-size: 0.9rem;
}
.error {
  color: #ff9b9b;
}
.row {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn,
.card {
  display: block;
  margin: 10px auto 0;
  padding: 12px 22px;
  font: inherit;
  color: var(--ink);
  background: #1b1a2b;
  border: 1px solid #3b3860;
  border-radius: 8px;
  cursor: pointer;
}
.row .btn {
  margin: 10px 0 0;
}
.btn.primary {
  background: #3a2f6e;
  border-color: var(--accent);
}
.btn.quiet {
  background: transparent;
}
.btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.btn:focus-visible,
.card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.card {
  width: 100%;
  text-align: left;
}
.card strong {
  display: block;
  font-size: 1.3rem;
}
.card span {
  color: var(--dim);
  font-size: 0.95rem;
}
.rules {
  text-align: left;
}
.slider {
  display: block;
  margin-top: 14px;
}
.slider input {
  display: block;
  width: 100%;
}
```

`src/main.ts` (temporary; Task 2 replaces it):
```ts
import './style.css';
```

- [ ] **Step 9: Write the failing test**

`src/engine/resolution.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { internalResolution } from './resolution';

describe('internalResolution', () => {
  it('scales a 16:9 window down to the target height', () => {
    expect(internalResolution(1920, 1080, 360)).toEqual({ width: 640, height: 360 });
  });

  it('never upscales a window smaller than the target', () => {
    expect(internalResolution(400, 300, 360)).toEqual({ width: 400, height: 300 });
  });

  it('survives a zero-size window', () => {
    expect(internalResolution(0, 0, 360)).toEqual({ width: 1, height: 1 });
  });
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `pnpm vitest run src/engine/resolution.test.ts`
Expected: FAIL. Vitest can't resolve `./resolution`.

- [ ] **Step 11: Implement**

`src/engine/resolution.ts`:
```ts
export interface Resolution {
  width: number;
  height: number;
}

/** Size of the low-res render target: `targetHeight` rows, width keeps the window's aspect ratio. */
export function internalResolution(
  viewWidth: number,
  viewHeight: number,
  targetHeight: number,
): Resolution {
  const height = Math.max(1, Math.min(targetHeight, Math.round(viewHeight)));
  const width = Math.max(1, Math.round((viewWidth / Math.max(1, viewHeight)) * height));
  return { width, height };
}
```

- [ ] **Step 12: Run the tests and the full check**

```bash
pnpm run format
pnpm run check
```
Expected: lint clean, typecheck clean, `Tests 3 passed`, build succeeds.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + three.js with base-repo tooling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Render stage and frame clamp

**Files:**
- Create: `src/engine/time.ts`, `src/engine/stage.ts`
- Modify: `src/main.ts` (temporary cube scene)
- Test: `src/engine/time.test.ts`

**Interfaces:**
- Consumes: `internalResolution` (Task 1).
- Produces: `clampDelta(seconds: number): number`, `MAX_FRAME_SECONDS`.
- Produces: `createStage(container: HTMLElement): Promise<Stage>`, plus `RENDER_HEIGHT`, `type Backend = 'webgpu' | 'webgl2'` and `type Updater = (dt: number) => void`.
  - `Stage = { renderer: THREE.WebGPURenderer; camera: THREE.PerspectiveCamera; backend: Backend; scene: THREE.Scene /* swappable */; addUpdater(fn): () => void; dispose(): void }`

- [ ] **Step 1: Write the failing test**

`src/engine/time.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clampDelta, MAX_FRAME_SECONDS } from './time';

describe('clampDelta', () => {
  it('keeps a normal frame', () => {
    expect(clampDelta(0.016)).toBe(0.016);
  });

  it('clamps the huge gap after a tab switch', () => {
    expect(clampDelta(180)).toBe(MAX_FRAME_SECONDS);
  });

  it('treats negative and NaN as no time', () => {
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/engine/time.test.ts`
Expected: FAIL (cannot resolve `./time`).

- [ ] **Step 3: Implement**

`src/engine/time.ts`:
```ts
/** Longest step the game advances in one frame, in seconds. Tab switches can report gaps of minutes. */
export const MAX_FRAME_SECONDS = 0.1;

export function clampDelta(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_FRAME_SECONDS);
}
```

`src/engine/stage.ts`. Notes: `THREE.Timer` replaces the deprecated `Clock`. `renderer.dispose()` returns a promise, hence `void`. `?webgl` forces the WebGL 2 backend:
```ts
import * as THREE from 'three/webgpu';
import { internalResolution } from './resolution';
import { clampDelta } from './time';

/** Rows rendered per frame before upscaling. Lower = chunkier PS1 look. Tuning knob. */
export const RENDER_HEIGHT = 360;

export type Backend = 'webgpu' | 'webgl2';
export type Updater = (dt: number) => void;

export interface Stage {
  readonly renderer: THREE.WebGPURenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly backend: Backend;
  /** The scene being drawn; home and dreams swap it. */
  scene: THREE.Scene;
  /** Run `fn(dt)` every frame; call the returned function to stop. */
  addUpdater(fn: Updater): () => void;
  dispose(): void;
}

function fit(renderer: THREE.WebGPURenderer, camera: THREE.PerspectiveCamera): void {
  const { width, height } = internalResolution(innerWidth, innerHeight, RENDER_HEIGHT);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/** Creates the one renderer the whole app shares. `?webgl` in the URL forces the WebGL 2 backend. */
export async function createStage(container: HTMLElement): Promise<Stage> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
  await renderer.init();
  renderer.setPixelRatio(1);
  container.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
  const updaters = new Set<Updater>();
  const timer = new THREE.Timer();
  timer.connect(document);
  const onResize = (): void => fit(renderer, camera);
  addEventListener('resize', onResize);
  onResize();
  const stage: Stage = {
    renderer,
    camera,
    backend: 'isWebGPUBackend' in renderer.backend ? 'webgpu' : 'webgl2',
    scene: new THREE.Scene(),
    addUpdater(fn) {
      updaters.add(fn);
      return () => {
        updaters.delete(fn);
      };
    },
    dispose() {
      void renderer.setAnimationLoop(null);
      removeEventListener('resize', onResize);
      timer.dispose();
      void renderer.dispose();
      renderer.domElement.remove();
    },
  };
  await renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = clampDelta(timer.getDelta());
    for (const fn of updaters) fn(dt);
    renderer.render(stage.scene, camera);
  });
  return stage;
}
```

`src/main.ts` (temporary cube scene):
```ts
import * as THREE from 'three/webgpu';
import { createStage } from './engine/stage';
import './style.css';

// Temporary (Task 2): proves the stage renders. Task 11 replaces this file.
async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('index.html needs #app');
  const stage = await createStage(root);
  document.documentElement.dataset.backend = stage.backend;
  stage.scene.background = new THREE.Color(0x101418);
  stage.scene.fog = new THREE.Fog(0x101418, 2, 12);
  stage.scene.add(new THREE.HemisphereLight(0x8899aa, 0x223311, 0.6));
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshLambertMaterial({ color: 0x884422 }),
  );
  cube.position.set(0, 0.5, -3);
  stage.scene.add(cube);
  stage.camera.position.set(0, 1.6, 0);
  stage.addUpdater((dt) => {
    cube.rotation.y += dt;
  });
}

void boot();
```

- [ ] **Step 4: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 6 passed`.

- [ ] **Step 5: [controller] Browser check**

Start `pnpm run dev` in the background. In Claude in Chrome open `http://localhost:5173/` and run `({ backend: document.documentElement.dataset.backend, h: document.querySelector('canvas').height })`.
Expected: `backend: 'webgpu'`, `h: 360`. The screenshot shows a dark fogged room with a slowly turning brown cube and chunky pixels. Repeat with `?webgl`. Expected: `backend: 'webgl2'` and the same picture. No console errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): shared WebGPU stage with low-res pixel look and frame clamp" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Crash-proof saves and settings

**Files:**
- Create: `src/engine/save.ts`, `src/engine/settings.ts`
- Test: `src/engine/save.test.ts`, `src/engine/settings.test.ts`

**Interfaces:**
- Produces: `StorageLike`, `SaveStore<T> { load(): T | null; save(value: T): boolean; clear(): void }`, `SAVE_PREFIX`, `browserStorage(): StorageLike | null`, `createSaveStore<T>(storage, key, isValid)`.
- Produces: `Settings { sensitivity: number; volume: number }`, `DEFAULT_SETTINGS`, `SENSITIVITY_RANGE`, `isSettings`, `clampSettings`, `loadSettings(store: SaveStore<Settings>): Settings`.

- [ ] **Step 1: Write the failing tests** (Review Focus 1 and 2 live here)

`src/engine/save.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createSaveStore, SAVE_PREFIX, type StorageLike } from './save';

interface Counter {
  count: number;
}

const isCounter = (value: unknown): value is Counter =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { count?: unknown }).count === 'number';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('createSaveStore', () => {
  it('round-trips a valid value under the game prefix', () => {
    const storage = memoryStorage();
    const store = createSaveStore(storage, 'test', isCounter);
    expect(store.save({ count: 3 })).toBe(true);
    expect(storage.data.has(`${SAVE_PREFIX}test`)).toBe(true);
    expect(store.load()).toEqual({ count: 3 });
  });

  it('returns null when nothing is saved', () => {
    expect(createSaveStore(memoryStorage(), 'test', isCounter).load()).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const storage = memoryStorage();
    storage.data.set(`${SAVE_PREFIX}test`, '{not json');
    expect(createSaveStore(storage, 'test', isCounter).load()).toBeNull();
  });

  it('returns null for data of the wrong shape', () => {
    const storage = memoryStorage();
    storage.data.set(`${SAVE_PREFIX}test`, '{"count":"five"}');
    expect(createSaveStore(storage, 'test', isCounter).load()).toBeNull();
  });

  it('never throws when storage throws', () => {
    const store = createSaveStore(throwingStorage, 'test', isCounter);
    expect(store.load()).toBeNull();
    expect(store.save({ count: 1 })).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });

  it('works when there is no storage at all', () => {
    const store = createSaveStore<Counter>(null, 'test', isCounter);
    expect(store.load()).toBeNull();
    expect(store.save({ count: 1 })).toBe(false);
  });
});
```

`src/engine/settings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { SaveStore } from './save';
import {
  clampSettings,
  DEFAULT_SETTINGS,
  isSettings,
  loadSettings,
  type Settings,
} from './settings';

function storeWith(value: Settings | null): SaveStore<Settings> {
  return { load: () => value, save: () => true, clear: () => undefined };
}

describe('settings', () => {
  it('recognises a settings object', () => {
    expect(isSettings({ sensitivity: 1, volume: 0.5 })).toBe(true);
    expect(isSettings({ sensitivity: '1', volume: 0.5 })).toBe(false);
    expect(isSettings(null)).toBe(false);
  });

  it('clamps tampered values into range', () => {
    expect(clampSettings({ sensitivity: 999, volume: -3 })).toEqual({ sensitivity: 3, volume: 0 });
  });

  it('falls back to defaults when nothing loads', () => {
    expect(loadSettings(storeWith(null))).toEqual(DEFAULT_SETTINGS);
  });

  it('returns a copy of the defaults, not the shared object', () => {
    expect(loadSettings(storeWith(null))).not.toBe(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/engine/save.test.ts src/engine/settings.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/engine/save.ts`:
```ts
/** The part of the Web Storage API the game uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveStore<T> {
  /** The saved value, or null when missing, corrupt, the wrong shape, or storage is blocked. */
  load(): T | null;
  /** True when the value was written. */
  save(value: T): boolean;
  clear(): void;
}

export const SAVE_PREFIX = 'kartiks-dreams:';

/** `localStorage`, or null when the browser blocks it (private mode, sandboxed iframe). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createSaveStore<T>(
  storage: StorageLike | null,
  key: string,
  isValid: (value: unknown) => value is T,
): SaveStore<T> {
  const fullKey = SAVE_PREFIX + key;
  return {
    load() {
      try {
        const raw = storage?.getItem(fullKey) ?? null;
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        return isValid(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(value) {
      if (!storage) return false;
      try {
        storage.setItem(fullKey, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        storage?.removeItem(fullKey);
      } catch {
        // Storage is blocked; there is nothing to clear.
      }
    },
  };
}
```

`src/engine/settings.ts`:
```ts
import type { SaveStore } from './save';

export interface Settings {
  /** Mouse-look multiplier. */
  sensitivity: number;
  /** Master volume, 0 to 1. */
  volume: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { sensitivity: 1, volume: 0.8 };
export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;

export function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof Settings, unknown>>;
  return typeof candidate.sensitivity === 'number' && typeof candidate.volume === 'number';
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Pulls hand-edited or out-of-range values back into the playable range. */
export function clampSettings(settings: Settings): Settings {
  return {
    sensitivity: clamp(
      settings.sensitivity,
      SENSITIVITY_RANGE.min,
      SENSITIVITY_RANGE.max,
      DEFAULT_SETTINGS.sensitivity,
    ),
    volume: clamp(settings.volume, 0, 1, DEFAULT_SETTINGS.volume),
  };
}

export function loadSettings(store: SaveStore<Settings>): Settings {
  const saved = store.load();
  return saved ? clampSettings(saved) : { ...DEFAULT_SETTINGS };
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 16 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): crash-proof save store and settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Device check, lock screens, paged reader and menus

**Files:**
- Create: `src/engine/device.ts`, `src/engine/lock.ts`, `src/engine/pager.ts`, `src/engine/ui.ts`, `src/engine/fullscreen.ts`, `src/engine/menus.ts`
- Test: `src/engine/device.test.ts`, `src/engine/lock.test.ts`, `src/engine/pager.test.ts`

**Interfaces:**
- Consumes: `Settings`, `SENSITIVITY_RANGE` (Task 3).
- Produces:
  - `isDesktop(matchMedia: MediaQuery): boolean`
  - `type LockEvent = 'locked' | 'unlocked' | 'lock-error'`, `type Screen = 'game' | 'pause-menu' | 'reader'`, `screenAfter(event, reading): Screen`
  - `startPager(total)`, `stepPager(state, action)`, `pagerActionForKey(code)`
  - `el(tag, className?, text?)`, `button(text, onClick, className?)`, `Overlay { root; fade(toBlack, ms?): Promise<void>; panel(build): HTMLElement; closePanel(): void }`, `createOverlay(root)`
  - `enterFullscreen()`, `toggleFullscreen()`
  - `showUnsupported(overlay)`, `showMessage(overlay, title, text)`, `showPages(overlay, pages, onDone)`, `showPauseMenu(overlay, PauseMenuOptions)`
  - `PauseMenuOptions = { title; howToPlay; settings; onResume; onSettings(settings); onQuit }`

- [ ] **Step 1: Write the failing tests** (Review Focus 3 and 5 live here)

`src/engine/device.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isDesktop, type MediaQuery } from './device';

const media =
  (matching: string[]): MediaQuery =>
  (query) => ({ matches: matching.includes(query) });

describe('isDesktop', () => {
  it('accepts a mouse or trackpad', () => {
    expect(isDesktop(media(['(pointer: fine)', '(hover: hover)']))).toBe(true);
  });

  it('rejects a touch-only phone or tablet', () => {
    expect(isDesktop(media(['(pointer: coarse)', '(hover: none)']))).toBe(false);
  });
});
```

`src/engine/lock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { screenAfter } from './lock';

describe('screenAfter', () => {
  it('shows the game once the mouse is locked', () => {
    expect(screenAfter('locked', false)).toBe('game');
  });

  it('opens the pause menu when the player presses Esc', () => {
    expect(screenAfter('unlocked', false)).toBe('pause-menu');
  });

  it('keeps the pause menu up when the lock is refused', () => {
    expect(screenAfter('lock-error', false)).toBe('pause-menu');
  });

  it('keeps the reader open while the player is reading pages', () => {
    expect(screenAfter('unlocked', true)).toBe('reader');
  });
});
```

`src/engine/pager.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  pagerActionForKey,
  pagerActionForKeyEvent,
  startPager,
  stepPager,
  type ReadingKey,
} from './pager';

describe('pager', () => {
  it('moves forward one page at a time and finishes after the last', () => {
    let state = startPager(2);
    state = stepPager(state, 'next');
    expect(state).toEqual({ index: 1, total: 2, done: false });
    expect(stepPager(state, 'next').done).toBe(true);
  });

  it('goes back but never before the first page', () => {
    const second = stepPager(startPager(3), 'next');
    expect(stepPager(second, 'prev').index).toBe(0);
    expect(stepPager(startPager(3), 'prev').index).toBe(0);
  });

  it('skips straight to the end', () => {
    expect(stepPager(startPager(5), 'skip').done).toBe(true);
  });

  it('is already done with no pages', () => {
    expect(startPager(0).done).toBe(true);
  });

  it('maps reading keys', () => {
    expect(pagerActionForKey('Enter')).toBe('next');
    expect(pagerActionForKey('ArrowRight')).toBe('next');
    expect(pagerActionForKey('Space')).toBe('next');
    expect(pagerActionForKey('ArrowLeft')).toBe('prev');
    expect(pagerActionForKey('Backspace')).toBe('prev');
    expect(pagerActionForKey('KeyW')).toBeNull();
  });
});

const key = (code: string, extra: Partial<ReadingKey> = {}): ReadingKey => ({
  code,
  repeat: false,
  modifier: false,
  onButton: false,
  ...extra,
});

describe('pagerActionForKeyEvent', () => {
  it('keeps arrows and Backspace working after a button was clicked', () => {
    expect(pagerActionForKeyEvent(key('ArrowRight', { onButton: true }))).toBe('next');
    expect(pagerActionForKeyEvent(key('ArrowLeft', { onButton: true }))).toBe('prev');
    expect(pagerActionForKeyEvent(key('Backspace', { onButton: true }))).toBe('prev');
  });

  it('leaves Enter and Space on a focused button to the button itself', () => {
    expect(pagerActionForKeyEvent(key('Enter', { onButton: true }))).toBeNull();
    expect(pagerActionForKeyEvent(key('Space', { onButton: true }))).toBeNull();
  });

  it('ignores a held-down key so pages never race past', () => {
    expect(pagerActionForKeyEvent(key('Enter', { repeat: true }))).toBeNull();
  });

  it('leaves browser shortcuts like Alt+Left alone', () => {
    expect(pagerActionForKeyEvent(key('ArrowLeft', { modifier: true }))).toBeNull();
  });

  it('turns pages with Enter when no button has focus', () => {
    expect(pagerActionForKeyEvent(key('Enter'))).toBe('next');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/engine/device.test.ts src/engine/lock.test.ts src/engine/pager.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the pure modules**

`src/engine/device.ts`:
```ts
export type MediaQuery = (query: string) => { matches: boolean };

/** Desktop = the main pointer is precise and can hover (mouse or trackpad). Touch-only devices fail. */
export function isDesktop(matchMedia: MediaQuery): boolean {
  return matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches;
}
```

`src/engine/lock.ts`:
```ts
export type LockEvent = 'locked' | 'unlocked' | 'lock-error';
export type Screen = 'game' | 'pause-menu' | 'reader';

/**
 * What to show after the mouse lock changes. A failed lock (denied, or retried too soon
 * after Esc) keeps a menu up so the player can click Resume again.
 */
export function screenAfter(event: LockEvent, reading: boolean): Screen {
  if (event === 'locked') return 'game';
  return reading ? 'reader' : 'pause-menu';
}
```

`src/engine/pager.ts`:
```ts
export interface PagerState {
  readonly index: number;
  readonly total: number;
  readonly done: boolean;
}

export type PagerAction = 'next' | 'prev' | 'skip';

export function startPager(total: number): PagerState {
  return { index: 0, total, done: total === 0 };
}

/** Pages only move when the player asks; nothing here runs on a timer. */
export function stepPager(state: PagerState, action: PagerAction): PagerState {
  if (state.done) return state;
  if (action === 'skip') return { ...state, done: true };
  if (action === 'prev') return { ...state, index: Math.max(0, state.index - 1) };
  if (state.index + 1 >= state.total) return { ...state, done: true };
  return { ...state, index: state.index + 1 };
}

/** Keyboard shortcuts for reading: Enter, → or Space = next; ← or Backspace = previous. */
export function pagerActionForKey(code: string): PagerAction | null {
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'ArrowRight' || code === 'Space') {
    return 'next';
  }
  if (code === 'ArrowLeft' || code === 'Backspace') return 'prev';
  return null;
}

export interface ReadingKey {
  code: string;
  /** The key is held down and the browser is auto-repeating it. */
  repeat: boolean;
  /** Alt, Ctrl or Cmd is held (a browser shortcut such as Alt+← back). */
  modifier: boolean;
  /** A button has focus; Enter and Space already click it natively. */
  onButton: boolean;
}

/**
 * The page action for a key press, or null to leave the key alone. Ignores held-down
 * repeats (no racing through pages), browser shortcuts, and Enter/Space on a focused
 * button (the button's own click handles those). Arrows and Backspace always work.
 */
export function pagerActionForKeyEvent(key: ReadingKey): PagerAction | null {
  if (key.repeat || key.modifier) return null;
  if (
    key.onButton &&
    key.code !== 'ArrowRight' &&
    key.code !== 'ArrowLeft' &&
    key.code !== 'Backspace'
  ) {
    return null;
  }
  return pagerActionForKey(key.code);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run src/engine/device.test.ts src/engine/lock.test.ts src/engine/pager.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Implement the DOM modules**

These are checked in the browser in Task 11. Vitest runs in Node, which has no DOM.

`src/engine/ui.ts`:
```ts
/** Small DOM helpers. Text always goes through textContent, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export interface Overlay {
  readonly root: HTMLElement;
  /** Fade the screen to black (true) or back (false). */
  fade(toBlack: boolean, ms?: number): Promise<void>;
  /** Replace the current panel. `build` fills it; returns the panel element. */
  panel(build: (panel: HTMLElement) => void): HTMLElement;
  closePanel(): void;
}

export function createOverlay(root: HTMLElement): Overlay {
  const fader = el('div', 'fader');
  root.append(fader);
  let current: HTMLElement | null = null;
  return {
    root,
    fade(toBlack, ms = 900) {
      fader.style.transitionDuration = `${ms}ms`;
      fader.classList.toggle('black', toBlack);
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    panel(build) {
      current?.remove();
      current = el('div', 'panel');
      build(current);
      root.append(current);
      return current;
    },
    closePanel() {
      current?.remove();
      current = null;
    },
  };
}
```

`src/engine/fullscreen.ts`. Safari has had unprefixed fullscreen since 16.4 (MDN browser-compat-data):
```ts
/** Full screen hides the browser bars. Needs a click or key press; failures are ignored. */
export function enterFullscreen(): void {
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen().catch(() => undefined);
}

export function toggleFullscreen(): void {
  if (!document.fullscreenElement) return enterFullscreen();
  document.exitFullscreen().catch(() => undefined);
}
```

`src/engine/menus.ts`. `showPages` reads keys through `pagerActionForKeyEvent`. The arrows and Backspace always work, even after a mouse click left a button focused. Enter and Space on a focused button are left to the button, so a page never turns twice. Held-down repeats and Alt/Ctrl/Cmd shortcuts are ignored. The listener removes itself if another screen replaces the pages:
```ts
import { toggleFullscreen } from './fullscreen';
import { pagerActionForKeyEvent, startPager, stepPager, type PagerAction } from './pager';
import { SENSITIVITY_RANGE, type Settings } from './settings';
import { button, el, type Overlay } from './ui';

export function showUnsupported(overlay: Overlay): void {
  overlay.panel((panel) => {
    panel.append(
      el('h1', '', "Kartik's Dreams"),
      el('p', 'big', 'Please play on a laptop or desktop computer.'),
      el('p', '', 'These games need a keyboard and a mouse or trackpad.'),
    );
  });
}

export function showMessage(overlay: Overlay, title: string, text: string): void {
  overlay.panel((panel) => panel.append(el('h1', '', title), el('p', 'big', text)));
}

/**
 * Player-paced pages: nothing advances on a timer. Enter, → or Space = next;
 * ← or Backspace = back; Skip ends early. `onDone` runs inside the key or click
 * handler, so it may request pointer lock.
 */
export function showPages(overlay: Overlay, pages: readonly string[], onDone: () => void): void {
  let state = startPager(pages.length);
  if (state.done) return onDone();
  const text = el('p', 'page-text');
  const count = el('p', 'page-count');
  const back = button('← Back', () => act('prev'));
  const next = button('Next →', () => act('next'), 'btn primary');
  const render = (): void => {
    text.textContent = pages[state.index] ?? '';
    count.textContent = `${state.index + 1} / ${state.total}`;
    back.disabled = state.index === 0;
    next.textContent = state.index + 1 === state.total ? 'Continue ✓' : 'Next →';
  };
  const onKey = (event: KeyboardEvent): void => {
    // Another screen replaced these pages: stop listening instead of acting on stale state.
    if (!panel.isConnected) return removeEventListener('keydown', onKey);
    const action = pagerActionForKeyEvent({
      code: event.code,
      repeat: event.repeat,
      modifier: event.altKey || event.ctrlKey || event.metaKey,
      onButton: event.target instanceof HTMLButtonElement,
    });
    if (!action) return;
    event.preventDefault();
    act(action);
  };
  const act = (action: PagerAction): void => {
    state = stepPager(state, action);
    if (!state.done) return render();
    removeEventListener('keydown', onKey);
    overlay.closePanel();
    onDone();
  };
  const panel = overlay.panel((body) => {
    const row = el('div', 'row');
    row.append(
      back,
      next,
      button('Skip', () => act('skip'), 'btn quiet'),
    );
    body.append(text, count, row, el('p', 'keys', 'Enter / → next · ← back'));
  });
  addEventListener('keydown', onKey);
  render();
}

export interface PauseMenuOptions {
  title: string;
  howToPlay: readonly string[];
  settings: Settings;
  onResume: () => void;
  onSettings: (settings: Settings) => void;
  onQuit: () => void;
}

function slider(
  label: string,
  min: number,
  max: number,
  value: number,
  onInput: (v: number) => void,
): HTMLElement {
  const wrap = el('label', 'slider', label);
  const input = el('input');
  Object.assign(input, { type: 'range', min: String(min), max: String(max), step: '0.05' });
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  wrap.append(input);
  return wrap;
}

export function showPauseMenu(overlay: Overlay, options: PauseMenuOptions): void {
  const settings = { ...options.settings };
  overlay.panel((panel) => {
    const rules = el('ul', 'rules');
    rules.append(...options.howToPlay.map((rule) => el('li', '', rule)));
    rules.hidden = true;
    const change = (patch: Partial<Settings>): void => {
      Object.assign(settings, patch);
      options.onSettings({ ...settings });
    };
    panel.append(
      el('h1', '', options.title),
      button('Resume', options.onResume, 'btn primary'),
      button('How to play', () => (rules.hidden = !rules.hidden)),
      button('Full screen on/off', toggleFullscreen),
      rules,
      slider(
        'Mouse sensitivity',
        SENSITIVITY_RANGE.min,
        SENSITIVITY_RANGE.max,
        settings.sensitivity,
        (v) => change({ sensitivity: v }),
      ),
      slider('Volume', 0, 1, settings.volume, (v) => change({ volume: v })),
      button('Quit to dreams', options.onQuit, 'btn quiet'),
    );
  });
}
```

- [ ] **Step 6: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 32 passed`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): device check, player-paced reader, pause menu, fullscreen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Keys, movement, collisions and the first-person player

**Files:**
- Create: `src/engine/input.ts`, `src/engine/movement.ts`, `src/engine/collide.ts`, `src/engine/player.ts`
- Test: `src/engine/input.test.ts`, `src/engine/movement.test.ts`, `src/engine/collide.test.ts`

**Interfaces:**
- Consumes: `LockEvent` (Task 4).
- Produces:
  - `class KeyState { attach(target: EventTarget); detach(); isDown(code): boolean; consumePress(code): boolean }`
  - `WALK_SPEED`, `SPRINT_SPEED`, `MoveIntent`, `moveIntent(isDown)`, `moveDelta(intent, fx, fz, dt)`
  - `Box`, `boxAt(x, z, width, depth)`, `resolveCircle(x, z, radius, boxes)`
  - `EYE_HEIGHT`, `PLAYER_RADIUS`, `Player { colliders: Box[]; lock(); unlock(); teleport(x, z, yaw); setSensitivity(s); update(dt); dispose() }`, `createPlayer(camera, dom, keys, onLock: (e: LockEvent) => void)`

- [ ] **Step 1: Write the failing tests**

`src/engine/input.test.ts`. Node has `EventTarget` but no `KeyboardEvent`, so the tests build plain events carrying `code` and `repeat`:
```ts
import { describe, expect, it } from 'vitest';
import { KeyState } from './input';

function key(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  return Object.assign(new Event(type), { code, repeat });
}

describe('KeyState', () => {
  it('tracks held keys', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(keys.isDown('KeyW')).toBe(true);
    target.dispatchEvent(key('keyup', 'KeyW'));
    expect(keys.isDown('KeyW')).toBe(false);
  });

  it('reports a press once, ignoring auto-repeat', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(key('keydown', 'KeyF'));
    target.dispatchEvent(key('keydown', 'KeyF', true));
    expect(keys.consumePress('KeyF')).toBe(true);
    expect(keys.consumePress('KeyF')).toBe(false);
  });

  it('forgets everything when the window loses focus', () => {
    const target = new EventTarget();
    const keys = new KeyState();
    keys.attach(target);
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(new Event('blur'));
    expect(keys.isDown('KeyW')).toBe(false);
  });
});
```

`src/engine/movement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { moveDelta, moveIntent, SPRINT_SPEED, WALK_SPEED } from './movement';

const held =
  (...codes: string[]) =>
  (code: string): boolean =>
    codes.includes(code);

describe('moveIntent', () => {
  it('walks forward with W', () => {
    expect(moveIntent(held('KeyW'))).toEqual({ forward: 1, right: 0, sprint: false });
  });

  it('normalises diagonals', () => {
    const intent = moveIntent(held('KeyW', 'KeyD'));
    expect(Math.hypot(intent.forward, intent.right)).toBeCloseTo(1);
  });

  it('cancels opposite keys', () => {
    expect(moveIntent(held('KeyW', 'KeyS')).forward).toBe(0);
  });

  it('sprints with either Shift', () => {
    expect(moveIntent(held('ShiftRight')).sprint).toBe(true);
  });
});

describe('moveDelta', () => {
  it('walks one second forward when facing -Z', () => {
    const step = moveDelta({ forward: 1, right: 0, sprint: false }, 0, -1, 1);
    expect(step.dx).toBeCloseTo(0);
    expect(step.dz).toBeCloseTo(-WALK_SPEED);
  });

  it('strafes right to +X when facing -Z', () => {
    const step = moveDelta({ forward: 0, right: 1, sprint: true }, 0, -1, 1);
    expect(step.dx).toBeCloseTo(SPRINT_SPEED);
    expect(step.dz).toBeCloseTo(0);
  });
});
```

`src/engine/collide.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { boxAt, resolveCircle } from './collide';

const crate = boxAt(0, 0, 2, 2); // spans -1..1 on both axes

describe('resolveCircle', () => {
  it('leaves a far-away player alone', () => {
    expect(resolveCircle(5, 5, 0.3, [crate])).toEqual({ x: 5, z: 5 });
  });

  it('pushes a player out of a side to exactly the radius', () => {
    const out = resolveCircle(1.1, 0, 0.3, [crate]);
    expect(out.x).toBeCloseTo(1.3);
    expect(out.z).toBeCloseTo(0);
  });

  it('pushes a player off a corner diagonally', () => {
    const out = resolveCircle(1.1, 1.1, 0.3, [crate]);
    expect(Math.hypot(out.x - 1, out.z - 1)).toBeCloseTo(0.3);
  });

  it('gets a player whose centre is inside out through the nearest face', () => {
    const out = resolveCircle(0.9, 0, 0.3, [crate]);
    expect(out).toEqual({ x: 1.3, z: 0 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/engine/input.test.ts src/engine/movement.test.ts src/engine/collide.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/engine/input.ts`. It reads `code` without a type assertion, because oxlint's `no-unsafe-type-assertion` rejects `as KeyboardEvent`:
```ts
function keyCode(event: Event): string {
  return 'code' in event && typeof event.code === 'string' ? event.code : '';
}

/** Tracks which keys are held, by physical key code (so WASD works on any layout). */
export class KeyState {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private target: EventTarget | null = null;

  private readonly onDown = (event: Event): void => {
    const code = keyCode(event);
    const repeat = 'repeat' in event && event.repeat === true;
    if (!repeat) this.pressed.add(code);
    this.held.add(code);
  };

  private readonly onUp = (event: Event): void => {
    this.held.delete(keyCode(event));
  };

  private readonly onBlur = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  attach(target: EventTarget): void {
    this.detach();
    this.target = target;
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    this.target?.removeEventListener('keydown', this.onDown);
    this.target?.removeEventListener('keyup', this.onUp);
    this.target?.removeEventListener('blur', this.onBlur);
    this.target = null;
    this.onBlur();
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True once per key press (for toggles like the flashlight). */
  consumePress(code: string): boolean {
    return this.pressed.delete(code);
  }
}
```

`src/engine/movement.ts`:
```ts
/** Walking and sprinting speeds in metres per second. Tuning knobs. */
export const WALK_SPEED = 2.2;
export const SPRINT_SPEED = 4.2;

export interface MoveIntent {
  /** -1 (back) to 1 (forward). */
  forward: number;
  /** -1 (left) to 1 (right). */
  right: number;
  sprint: boolean;
}

/** WASD + Shift to a movement wish. Diagonals are normalised so they aren't faster. */
export function moveIntent(isDown: (code: string) => boolean): MoveIntent {
  const forward = Number(isDown('KeyW')) - Number(isDown('KeyS'));
  const right = Number(isDown('KeyD')) - Number(isDown('KeyA'));
  const length = Math.hypot(forward, right) || 1;
  return {
    forward: forward / length,
    right: right / length,
    sprint: isDown('ShiftLeft') || isDown('ShiftRight'),
  };
}

/**
 * World-space step on the ground plane. (fx, fz) is the camera's forward direction
 * flattened and normalised; right is that vector turned 90° clockwise seen from above.
 */
export function moveDelta(
  intent: MoveIntent,
  fx: number,
  fz: number,
  dt: number,
): { dx: number; dz: number } {
  const speed = (intent.sprint ? SPRINT_SPEED : WALK_SPEED) * dt;
  const rx = -fz;
  const rz = fx;
  return {
    dx: (fx * intent.forward + rx * intent.right) * speed,
    dz: (fz * intent.forward + rz * intent.right) * speed,
  };
}
```

`src/engine/collide.ts`:
```ts
/** Axis-aligned rectangle on the ground plane (seen from above). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function boxAt(x: number, z: number, width: number, depth: number): Box {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

function exitInside(x: number, z: number, radius: number, box: Box): { x: number; z: number } {
  const exits = [
    { x: box.minX - radius, z },
    { x: box.maxX + radius, z },
    { x, z: box.minZ - radius },
    { x, z: box.maxZ + radius },
  ];
  let best = exits[0];
  for (const exit of exits) {
    if (Math.hypot(exit.x - x, exit.z - z) < Math.hypot(best.x - x, best.z - z)) best = exit;
  }
  return best;
}

/**
 * Pushes a circle (the player, radius in metres) out of every box it overlaps.
 * ponytail: checks every box each frame — fine for a few hundred; add a grid if levels grow.
 */
export function resolveCircle(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Box[],
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const box of boxes) {
    const cx = Math.max(box.minX, Math.min(px, box.maxX));
    const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
    const dx = px - cx;
    const dz = pz - cz;
    const distance = Math.hypot(dx, dz);
    if (distance >= radius) continue;
    if (distance > 1e-9) {
      px = cx + (dx / distance) * radius;
      pz = cz + (dz / distance) * radius;
    } else {
      ({ x: px, z: pz } = exitInside(px, pz, radius, box));
    }
  }
  return { x: px, z: pz };
}
```

`src/engine/player.ts`. `lock()` calls `requestPointerLock()` itself and swallows the rejection. Refusals still reach the pause menu through `pointerlockerror` (Review Focus 3):
```ts
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as THREE from 'three/webgpu';
import { resolveCircle, type Box } from './collide';
import type { KeyState } from './input';
import type { LockEvent } from './lock';
import { moveDelta, moveIntent } from './movement';

export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.3;

export interface Player {
  colliders: Box[];
  /** Must be called from a click or key handler (browsers require a user gesture). */
  lock(): void;
  unlock(): void;
  teleport(x: number, z: number, yaw: number): void;
  setSensitivity(sensitivity: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** First-person walker: mouse look via Pointer Lock, WASD + Shift on the ground plane. */
export function createPlayer(
  camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
  keys: KeyState,
  onLock: (event: LockEvent) => void,
): Player {
  const controls = new PointerLockControls(camera, dom);
  const forward = new THREE.Vector3();
  const onLocked = (): void => onLock('locked');
  const onUnlocked = (): void => onLock('unlocked');
  const onError = (): void => onLock('lock-error');
  controls.addEventListener('lock', onLocked);
  controls.addEventListener('unlock', onUnlocked);
  document.addEventListener('pointerlockerror', onError);
  const player: Player = {
    colliders: [],
    lock() {
      // Ask the browser directly so a refusal can't become an unhandled rejection; refusals
      // still fire 'pointerlockerror'. Safari before 18.4 returns undefined, not a promise.
      const request: unknown = dom.requestPointerLock();
      if (request instanceof Promise) request.catch(() => undefined);
    },
    unlock: () => controls.unlock(),
    teleport(x, z, yaw) {
      camera.position.set(x, EYE_HEIGHT, z);
      camera.rotation.set(0, yaw, 0, 'YXZ');
    },
    setSensitivity(sensitivity) {
      controls.pointerSpeed = sensitivity;
    },
    update(dt) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const step = moveDelta(
        moveIntent((code) => keys.isDown(code)),
        forward.x,
        forward.z,
        dt,
      );
      const next = resolveCircle(
        camera.position.x + step.dx,
        camera.position.z + step.dz,
        PLAYER_RADIUS,
        player.colliders,
      );
      camera.position.set(next.x, EYE_HEIGHT, next.z);
    },
    dispose() {
      controls.removeEventListener('lock', onLocked);
      controls.removeEventListener('unlock', onUnlocked);
      document.removeEventListener('pointerlockerror', onError);
      controls.unlock();
      controls.dispose();
    },
  };
  return player;
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 45 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): first-person player with WASD, sprint and box collisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Audio bus and procedural room tone

**Files:**
- Create: `src/engine/audio.ts`
- Test: `src/engine/audio.test.ts`

**Interfaces:**
- Produces: `AudioBus { listener: THREE.AudioListener; unlock(): Promise<void>; setVolume(v); loop(buffer, volume): THREE.Audio }`, `createAudioBus(camera)`, `brownNoise(length, random?): Float32Array<ArrayBuffer>`, `roomToneBuffer(context, seconds?)`.

- [ ] **Step 1: Write the failing test**

`src/engine/audio.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { brownNoise } from './audio';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('brownNoise', () => {
  it('stays inside -1..1 and is not silent', () => {
    const samples = brownNoise(48000, seeded(7));
    const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.01);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/engine/audio.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/engine/audio.ts`. The return type `Float32Array<ArrayBuffer>` is required by `copyToChannel`'s lib types:
```ts
import * as THREE from 'three/webgpu';

export interface AudioBus {
  readonly listener: THREE.AudioListener;
  /** Browsers start audio suspended; call from a click handler. */
  unlock(): Promise<void>;
  setVolume(volume: number): void;
  loop(buffer: AudioBuffer, volume: number): THREE.Audio;
}

export function createAudioBus(camera: THREE.Camera): AudioBus {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  return {
    listener,
    async unlock() {
      if (listener.context.state !== 'running') await listener.context.resume();
    },
    setVolume(volume) {
      listener.setMasterVolume(volume);
    },
    loop(buffer, volume) {
      const sound = new THREE.Audio(listener);
      sound.setBuffer(buffer);
      sound.setLoop(true);
      sound.setVolume(volume);
      sound.play();
      return sound;
    },
  };
}

/** Brown noise (smoothed white noise): a low room rumble, no sound file needed. Values stay in -1..1. */
export function brownNoise(
  length: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    samples[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
  return samples;
}

export function roomToneBuffer(context: BaseAudioContext, seconds = 6): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * seconds),
    context.sampleRate,
  );
  buffer.copyToChannel(brownNoise(buffer.length), 0);
  return buffer;
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 46 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): audio bus with click-to-unlock and brown-noise room tone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Model loading and the bedroom assets

**Files:**
- Create: `src/engine/models.ts`, `public/assets/LICENSES.md`, `public/assets/home/*.glb` (8 files)
- Test: `src/engine/models.test.ts`

**Interfaces:**
- Produces: `litFrom(material): THREE.Material`, `makeLit(root)`, `enableShadows(root, cast = true)`, `loadModel(url): Promise<THREE.Object3D>` (cached, lit, shadowed; returns a clone).

Facts verified on 2026-10-03:
- Kenney Furniture Kit is CC0 (its `License.txt`) and ships GLBs under `Models/GLTF format/`.
- Those GLBs use `KHR_materials_unlit`, which `GLTFLoader` turns into `MeshBasicMaterial`. That ignores lights, so the room would never go dark. `makeLit` fixes it.
- The models are small: the bed is 1.13 long and the walls 1.29 tall, hence `FURNITURE_SCALE = 2` in Task 10. Each model's origin sits at a corner (x ≥ 0, z ≤ 0).

- [ ] **Step 1: 🔎 Re-verify the licence and download link, then fetch the models**

```bash
URL=$(curl -sL https://kenney.nl/assets/furniture-kit | grep -o 'https://kenney.nl/media/pages/assets/furniture-kit/[^"]*\.zip' | head -1)
echo "$URL"
curl -sL -o /tmp/kenney-furniture.zip "$URL"
unzip -p /tmp/kenney-furniture.zip License.txt | grep -i "CC0"
mkdir -p public/assets/home
for f in bedSingle cabinetBedDrawerTable lampRoundTable wall wallWindow floorFull rugRound books; do
  unzip -oqj /tmp/kenney-furniture.zip "Models/GLTF format/$f.glb" -d public/assets/home
done
ls public/assets/home
rm /tmp/kenney-furniture.zip
```
Expected: a `.zip` URL, a line containing `CC0`, and 8 `.glb` files listed. If the page no longer offers the link or the licence isn't CC0, stop and tell Kartik.

- [ ] **Step 2: Write `public/assets/LICENSES.md`**

```markdown
# Asset licences

Every file in `public/assets/` must be listed here. CC0 only.

| Files | Source | Licence |
|---|---|---|
| `home/*.glb` (bedSingle, cabinetBedDrawerTable, lampRoundTable, wall, wallWindow, floorFull, rugRound, books) | Kenney — Furniture Kit, https://kenney.nl/assets/furniture-kit | CC0 1.0 |
```

- [ ] **Step 3: Write the failing test**

`src/engine/models.test.ts`:
```ts
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { enableShadows, litFrom, makeLit } from './models';

describe('litFrom', () => {
  it('turns an unlit material into a lit one with the same colour and name', () => {
    const unlit = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    unlit.name = 'carpet';
    const lit = litFrom(unlit);
    if (!(lit instanceof THREE.MeshLambertMaterial)) throw new Error('expected Lambert');
    expect(lit.color.getHex()).toBe(0xff0000);
    expect(lit.name).toBe('carpet');
  });

  it('leaves lit materials alone', () => {
    const standard = new THREE.MeshStandardMaterial();
    expect(litFrom(standard)).toBe(standard);
  });

  it('converts every mesh in a model', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    makeLit(root);
    const mesh = root.children[0];
    if (!(mesh instanceof THREE.Mesh)) throw new Error('expected a mesh');
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });
});

describe('enableShadows', () => {
  it('makes meshes cast and receive shadows', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    root.add(mesh);
    enableShadows(root);
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true]);
  });

  it('can make meshes receive only (for a lamp that holds its own light)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    enableShadows(mesh, false);
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, true]);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm vitest run src/engine/models.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5: Implement**

`src/engine/models.ts`:
```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';

/**
 * Kenney's GLBs use KHR_materials_unlit, which GLTFLoader turns into MeshBasicMaterial —
 * those ignore lights, so the room would never go dark. Swap them for Lambert (cheap, PS1-like).
 */
export function litFrom(material: THREE.Material): THREE.Material {
  if (!(material instanceof THREE.MeshBasicMaterial)) return material;
  const lit = new THREE.MeshLambertMaterial({
    color: material.color,
    map: material.map,
    vertexColors: material.vertexColors,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
  });
  lit.name = material.name;
  return lit;
}

function isMesh(node: THREE.Object3D): node is THREE.Mesh {
  return node instanceof THREE.Mesh;
}

export function makeLit(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.material = Array.isArray(node.material)
        ? node.material.map(litFrom)
        : litFrom(node.material);
    }
  });
}

/** Every mesh in `root` casts and receives shadows (`cast` false: receive only). */
export function enableShadows(root: THREE.Object3D, cast = true): void {
  root.traverse((node) => {
    if (isMesh(node)) {
      node.castShadow = cast;
      node.receiveShadow = true;
    }
  });
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

/** Loads a .glb once (lit, shadowed); every call returns a fresh clone sharing geometry and materials. */
export async function loadModel(url: string): Promise<THREE.Object3D> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => {
      makeLit(gltf.scene);
      enableShadows(gltf.scene);
      return gltf.scene;
    });
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return (await pending).clone(true);
}
```

- [ ] **Step 6: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 51 passed`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): cached GLB loading with unlit-to-lit swap; add Kenney bedroom models" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dream registry and safe loading

**Files:**
- Create: `src/dreams/types.ts`, `src/dreams/registry.ts`, `src/dreams/load.ts`, `src/dreams/follow-the-river/index.ts` (temporary)
- Test: `src/dreams/dreams.test.ts`

**Interfaces:**
- Consumes: `Stage`, `Overlay`, `AudioBus`, `KeyState`, `Player`.
- Produces:
  - `DreamInfo { id; title; minutes; warnings; intro; howToPlay; load(): Promise<DreamModule> }`
  - `DreamContext { stage; overlay; audio; keys; player; isPaused(): boolean; read(pages): void }`
  - `DreamModule { start(ctx): Promise<void>; dispose(): void }`
  - `DREAMS: readonly DreamInfo[]`
  - `LoadResult`, `loadDream(info): Promise<LoadResult>`
  - `createDream(): DreamModule` exported from each dream's `index.ts`

- [ ] **Step 1: Write the failing test**

`src/dreams/dreams.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadDream } from './load';
import { DREAMS } from './registry';
import type { DreamInfo, DreamModule } from './types';

const stubDream: DreamModule = { start: async () => undefined, dispose: () => undefined };

function info(load: DreamInfo['load']): DreamInfo {
  return { ...DREAMS[0], load };
}

describe('dream registry', () => {
  it('has unique kebab-case ids', () => {
    const ids = DREAMS.map((dream) => dream.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every dream a title, warnings, intro pages and rules', () => {
    for (const dream of DREAMS) {
      expect(dream.title.length).toBeGreaterThan(0);
      expect(dream.minutes).toBeGreaterThan(0);
      expect(dream.warnings.length).toBeGreaterThan(0);
      expect(dream.intro.length).toBeGreaterThan(0);
      expect(dream.howToPlay.length).toBeGreaterThan(0);
    }
  });
});

describe('loadDream', () => {
  it('returns the dream when its code loads', async () => {
    const result = await loadDream(info(async () => stubDream));
    expect(result).toEqual({ ok: true, dream: stubDream });
  });

  it('turns a failed download into a message naming the dream', async () => {
    const result = await loadDream(info(() => Promise.reject(new Error('offline'))));
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('Follow the River');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/dreams/dreams.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/dreams/types.ts`:
```ts
import type { AudioBus } from '../engine/audio';
import type { KeyState } from '../engine/input';
import type { Player } from '../engine/player';
import type { Stage } from '../engine/stage';
import type { Overlay } from '../engine/ui';

/** What the home screen shows on a dream's card, plus how to load it. */
export interface DreamInfo {
  id: string;
  title: string;
  minutes: number;
  warnings: readonly string[];
  /** Player-paced pages shown before play (goal, then controls). */
  intro: readonly string[];
  /** Every rule, listed in the pause menu's "How to play". */
  howToPlay: readonly string[];
  load: () => Promise<DreamModule>;
}

/** Everything a running dream may use. The app shell owns the player and pause menu. */
export interface DreamContext {
  stage: Stage;
  overlay: Overlay;
  audio: AudioBus;
  keys: KeyState;
  player: Player;
  /** True while the pause menu or a page is open. Dreams freeze their logic then. */
  isPaused: () => boolean;
  /** Show player-paced pages (pauses the game until the player finishes reading). */
  read: (pages: readonly string[]) => void;
}

export interface DreamModule {
  /** Build the world: set `ctx.stage.scene`, colliders and spawn. */
  start(ctx: DreamContext): Promise<void>;
  dispose(): void;
}
```

`src/dreams/registry.ts`. Intro text is short, one idea per page, for slow readers:
```ts
import type { DreamInfo } from './types';

export const DREAMS: readonly DreamInfo[] = [
  {
    id: 'follow-the-river',
    title: 'Follow the River',
    minutes: 12,
    warnings: ['Horror', 'Jumpscares', 'Loud sounds'],
    intro: [
      'Follow the river. Survive 3 nights.',
      'Move with W A S D. Look around with the mouse. Hold Shift to run.',
      'Press F to turn your flashlight on or off.',
      'Press Esc any time to pause. The pause menu has every rule.',
    ],
    howToPlay: ['W A S D: move. Mouse: look. Shift: run.', 'F: flashlight on/off.', 'Esc: pause.'],
    load: async () => (await import('./follow-the-river/index')).createDream(),
  },
];
```

`src/dreams/load.ts`:
```ts
import type { DreamInfo, DreamModule } from './types';

export type LoadResult = { ok: true; dream: DreamModule } | { ok: false; message: string };

/** Loads a dream's code. A failed download becomes a message instead of a crash. */
export async function loadDream(info: DreamInfo): Promise<LoadResult> {
  try {
    return { ok: true, dream: await info.load() };
  } catch {
    return {
      ok: false,
      message: `Couldn't load "${info.title}". Check your internet connection and try again.`,
    };
  }
}
```

`src/dreams/follow-the-river/index.ts` (temporary; Task 9 replaces it):
```ts
import * as THREE from 'three/webgpu';
import type { DreamModule } from '../types';

// Temporary (Task 8): an empty world so the registry has something to load. Task 9 replaces it.
export function createDream(): DreamModule {
  return {
    start(ctx) {
      ctx.stage.scene = new THREE.Scene();
      return Promise.resolve();
    },
    dispose() {
      // Nothing to clean up yet.
    },
  };
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 55 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(dreams): registry, dream contract and failure-safe loading" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Riverbank with Blender-built skyline, sky and flashlight

**Files:**
- Create: `tools/blender/river_props.py`, `public/assets/river/*.glb` (5 files, generated), `src/engine/sky.ts`, `src/dreams/follow-the-river/riverbank.ts`, `src/dreams/follow-the-river/skyline.ts`, `src/dreams/follow-the-river/flashlight.ts`
- Modify: `public/assets/LICENSES.md` (add a row)
- Modify: `src/dreams/follow-the-river/index.ts` (replace the temporary file)
- Test: `src/dreams/follow-the-river/riverbank.test.ts`, `src/dreams/follow-the-river/skyline.test.ts`

**Interfaces:**
- Consumes: `boxAt`, `resolveCircle`, `PLAYER_RADIUS`, `DreamContext`.
- Produces:
  - `createSkyDome(top, horizon, radius?)`
  - `SKY`, `RIVER_X`, `RIVER_WIDTH`, `BANK_LENGTH`, `CRATES`, `SPAWN`, `riverbankColliders(): Box[]`, `buildRiverbank(): Promise<THREE.Scene>`
  - `Silhouette`, `BuildingModel`, `skylineLayout(seed, count, minX, maxX)`, `buildingFor(height): BuildingModel`, `addSkyline(scene): Promise<void>`
  - `FLASHLIGHT`, `createFlashlight(camera): THREE.SpotLight`

This is a stand-in for Plan 2's real city. It still has to look like a place: a dark overcast sky dome, and ground and water running ~360 m into fog. Across the river are **Blender-built** concrete blocks, mostly dark windows with a few lit. Behind the bank is a **Blender-built** forest of pines and dead trees. There are grey-box crates on the bank and a flashlight cone on the ground. The flashlight casts soft shadows (they switch on in Task 12). Trees are smooth-shaded, so they don't look jagged.

The scenery is made by a committed headless Blender script, so anyone can rebuild it. The Blender Lab MCP (`.mcp.json`) is optional and only for previews; the script is the source of truth.

- [ ] **Step 1: 🔎 Check Blender and its glTF exporter**

```bash
/Applications/Blender.app/Contents/MacOS/Blender --version | head -1
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-expr "import bpy; print('GLTF_OK', hasattr(bpy.ops.export_scene, 'gltf'))" | grep GLTF_OK
```
Expected: a Blender LTS version line and `GLTF_OK True`. If Blender is missing, stop and ask Kartik.

- [ ] **Step 2: Write the Blender script**

`tools/blender/river_props.py`:
```python
"""Builds the low-poly river scenery and exports one GLB per prop.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/river_props.py -- public/assets/river
"""

import math
import random
import sys
from pathlib import Path

import bpy

OUT = Path(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/assets/river")
random.seed(7)


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple, emission: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def box(name: str, size: tuple, location: tuple, mat: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def join(objects: list, name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def export(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format="GLB")


def building(name: str, width: float, depth: float, height: float, lit_ratio: float) -> None:
    """Concrete block, rooftop box, rows of dark windows with a few still lit."""
    reset()
    wall = material("concrete", (0.09, 0.1, 0.11))
    dark = material("windowDark", (0.02, 0.025, 0.03))
    lit = material("windowLit", (1.0, 0.72, 0.35), emission=2.5)
    parts = [box("body", (width, depth, height), (0, 0, height / 2), wall)]
    parts.append(box("roof", (width * 0.4, depth * 0.4, 1.2), (width * 0.15, 0, height + 0.6), wall))
    floors = int(height // 3)
    columns = max(1, int(width // 2))
    for f in range(floors):
        for c in range(columns):
            x = -width / 2 + (c + 0.5) * width / columns
            z = 1.6 + f * 3
            glass = lit if random.random() < lit_ratio else dark
            parts.append(box("win", (0.9, 0.05, 1.2), (x, -depth / 2 - 0.02, z), glass))
    join(parts, name)
    export(name)


def pine(name: str, height: float) -> None:
    """Three stacked low-poly cones on a trunk."""
    reset()
    bark = material("bark", (0.06, 0.04, 0.03))
    needles = material("needles", (0.04, 0.07, 0.04))
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=10, radius=0.18, depth=height * 0.3, location=(0, 0, height * 0.15)
    )
    trunk = bpy.context.active_object
    trunk.data.materials.append(bark)
    parts = [trunk]
    for i in range(3):
        radius = height * (0.28 - i * 0.06)
        z = height * (0.3 + i * 0.22)
        bpy.ops.mesh.primitive_cone_add(
            vertices=12, radius1=radius, depth=height * 0.4, location=(0, 0, z + height * 0.2)
        )
        cone = bpy.context.active_object
        cone.rotation_euler[2] = random.random() * math.pi
        cone.data.materials.append(needles)
        parts.append(cone)
    join(parts, name)
    bpy.ops.object.shade_smooth()
    export(name)


def dead_tree(name: str, height: float) -> None:
    """A leafless trunk with crooked branches."""
    reset()
    bark = material("bark", (0.05, 0.04, 0.035))
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.15, depth=height, location=(0, 0, height / 2))
    parts = [bpy.context.active_object]
    for i in range(4):
        angle = i * math.pi / 2 + random.random() * 0.6
        length = height * 0.35
        z = height * (0.5 + i * 0.1)
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.06,
            depth=length,
            location=(math.cos(angle) * length / 3, math.sin(angle) * length / 3, z),
        )
        branch = bpy.context.active_object
        branch.rotation_euler = (math.sin(angle) * 0.9, -math.cos(angle) * 0.9, 0)
        parts.append(branch)
    for part in parts:
        part.data.materials.append(bark)
    join(parts, name)
    bpy.ops.object.shade_smooth()
    export(name)


building("buildingTall", 6, 6, 27, 0.08)
building("buildingMid", 8, 6, 15, 0.12)
building("buildingLow", 10, 7, 9, 0.18)
pine("pine", 9)
dead_tree("deadTree", 7)
print("EXPORTED", sorted(p.name for p in OUT.glob("*.glb")))
```

- [ ] **Step 3: Build the props**

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/river_props.py -- public/assets/river | grep EXPORTED
```
Expected: `EXPORTED ['buildingLow.glb', 'buildingMid.glb', 'buildingTall.glb', 'deadTree.glb', 'pine.glb']`.

Append this row to the table in `public/assets/LICENSES.md`:

```markdown
| `river/*.glb` (buildingTall, buildingMid, buildingLow, pine, deadTree) | Made for this project by `tools/blender/river_props.py` | CC0 1.0 (original work) |
```

- [ ] **Step 4: Write the failing tests**

`src/dreams/follow-the-river/riverbank.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../engine/collide';
import { PLAYER_RADIUS } from '../../engine/player';
import { riverbankColliders, SPAWN } from './riverbank';

describe('riverbank', () => {
  it('spawns the player in open ground, not inside a collider', () => {
    expect(resolveCircle(SPAWN.x, SPAWN.z, PLAYER_RADIUS, riverbankColliders())).toEqual({
      x: SPAWN.x,
      z: SPAWN.z,
    });
  });

  it('keeps the player out of the river', () => {
    const out = resolveCircle(5, -10, PLAYER_RADIUS, riverbankColliders());
    expect(out.x).toBeLessThan(5);
  });
});
```

`src/dreams/follow-the-river/skyline.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildingFor, skylineLayout } from './skyline';

describe('skylineLayout', () => {
  it('is the same every time for the same seed', () => {
    expect(skylineLayout(7, 10, 22, 60)).toEqual(skylineLayout(7, 10, 22, 60));
  });

  it('runs past the fog in both directions, so no row end is ever visible', () => {
    const zs = skylineLayout(7, 60, 22, 60).map((s) => s.z);
    expect(Math.max(...zs)).toBeGreaterThan(70);
    expect(Math.min(...zs)).toBeLessThan(-180);
  });

  it('keeps every silhouette outside the walkable strip', () => {
    for (const s of skylineLayout(7, 60, 22, 60)) {
      expect(s.x).toBeGreaterThanOrEqual(22);
      expect(s.x).toBeLessThanOrEqual(60);
    }
  });
});

describe('buildingFor', () => {
  it('picks taller Blender buildings for taller silhouettes', () => {
    expect(buildingFor(25)).toBe('buildingTall');
    expect(buildingFor(15)).toBe('buildingMid');
    expect(buildingFor(8)).toBe('buildingLow');
  });
});
```

- [ ] **Step 5: Run them and watch them fail**

Run: `pnpm vitest run src/dreams/follow-the-river`
Expected: FAIL (modules not found).

- [ ] **Step 6: Implement**

`src/engine/sky.ts`:
```ts
import * as THREE from 'three/webgpu';

/**
 * A huge inside-out sphere shaded from `top` to `horizon`, so there is never an empty
 * background edge. Fog is off so the sky keeps its colour; geometry fog hides the ground's end.
 */
export function createSkyDome(top: number, horizon: number, radius = 180): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 24, 12);
  const colors: number[] = [];
  const position = geometry.getAttribute('position');
  const a = new THREE.Color(horizon);
  const b = new THREE.Color(top);
  const mixed = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const height = Math.max(0, position.getY(i) / radius);
    mixed.lerpColors(a, b, Math.sqrt(height));
    colors.push(mixed.r, mixed.g, mixed.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -1;
  return dome;
}
```

`src/dreams/follow-the-river/skyline.ts`. It loads the Blender GLBs through `loadModel`. Windows face the river: Blender's -Y face exports as glTF +Z, which rotates to -X.
```ts
import * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';

export interface Silhouette {
  x: number;
  z: number;
  width: number;
  height: number;
}

export type BuildingModel = 'buildingTall' | 'buildingMid' | 'buildingLow';

/** Repeatable pseudo-random numbers so the skyline is the same every visit. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Silhouettes run from well behind the spawn (z = 0) to well past the bank's far end
 * (z ≈ -110), further than the fog reaches (70 m), so no end of the row is ever visible.
 */
export const SKYLINE_FROM_Z = 90;
export const SKYLINE_SPAN = 290;

/**
 * Distant city blocks across the river and a tree line behind the bank, all well outside
 * the walkable strip. They read as shapes in the fog, so the world never ends at a cliff.
 */
export function skylineLayout(
  seed: number,
  count: number,
  minX: number,
  maxX: number,
): Silhouette[] {
  const random = seeded(seed);
  const out: Silhouette[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: minX + random() * (maxX - minX),
      z: SKYLINE_FROM_Z - i * (SKYLINE_SPAN / count) - random() * 4,
      width: 3 + random() * 6,
      height: 6 + random() * 22,
    });
  }
  return out;
}

/** Which Blender building (tools/blender/river_props.py) fits a silhouette's height. */
export function buildingFor(height: number): BuildingModel {
  if (height > 20) return 'buildingTall';
  if (height > 12) return 'buildingMid';
  return 'buildingLow';
}

const url = (name: string): string => `/assets/river/${name}.glb`;

/** Native heights of the Blender props, in metres. Keep in sync with river_props.py. */
const PINE_HEIGHT = 9;
const DEAD_TREE_HEIGHT = 7;

/**
 * Places the Blender buildings (windows facing the river) and trees.
 * ponytail: one clone per prop (~130 meshes); switch to InstancedMesh if draw calls hurt.
 */
export async function addSkyline(scene: THREE.Scene): Promise<void> {
  const buildings = skylineLayout(7, 60, 22, 60);
  const trees = skylineLayout(11, 70, -40, -16);
  const placed = await Promise.all([
    ...buildings.map((b) => loadModel(url(buildingFor(b.height)))),
    ...trees.map((_, i) => loadModel(url(i % 3 === 2 ? 'deadTree' : 'pine'))),
  ]);
  buildings.forEach((b, i) => {
    const model = placed[i];
    model.position.set(b.x, 0, b.z);
    model.rotation.y = -Math.PI / 2;
    scene.add(model);
  });
  trees.forEach((t, i) => {
    const model = placed[buildings.length + i];
    const native = i % 3 === 2 ? DEAD_TREE_HEIGHT : PINE_HEIGHT;
    model.position.set(t.x, 0, t.z);
    model.rotation.y = t.width;
    model.scale.setScalar((t.height * 0.6) / native);
    scene.add(model);
  });
}
```

`src/dreams/follow-the-river/riverbank.ts`:
```ts
import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { enableShadows } from '../../engine/models';
import { createSkyDome } from '../../engine/sky';
import { addSkyline } from './skyline';

/** Overcast dusk: dark grey-blue. Never bright. */
export const SKY = 0x1b2026;
export const RIVER_X = 7;
export const RIVER_WIDTH = 8;
export const BANK_LENGTH = 120;

/** Grey-box crates: [x, z, size]. Placeholder props until Plan 2's city kit. */
export const CRATES: ReadonlyArray<readonly [number, number, number]> = [
  [-2, -6, 1.2],
  [1.5, -11, 1],
  [-3.5, -17, 1.6],
  [0.5, -24, 1.1],
  [-1.5, -32, 1.4],
];

export const SPAWN = { x: 0, z: 0, yaw: 0 } as const;

/** Name of the sky dome, so the dream can keep it centred on the player. */
export const SKY_NAME = 'sky';

/**
 * The dome follows the player (see index.ts), so its far side is always 80 m away,
 * well inside the camera's 200 m far plane.
 */
const SKY_DOME_RADIUS = 80;

/** Crates, the river (no swimming yet) and the edges of the walkable strip. */
export function riverbankColliders(): Box[] {
  const crates = CRATES.map(([x, z, size]) => boxAt(x, z, size, size));
  const middle = -BANK_LENGTH / 2 + 10;
  return [
    ...crates,
    boxAt(RIVER_X, middle, RIVER_WIDTH, BANK_LENGTH),
    boxAt(-8, middle, 2, BANK_LENGTH),
    boxAt(0, 11, 24, 2),
    boxAt(0, -BANK_LENGTH + 9, 24, 2),
  ];
}

function plane(width: number, depth: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export async function buildRiverbank(): Promise<THREE.Scene> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 6, 70);
  const sky = createSkyDome(0x07090c, SKY, SKY_DOME_RADIUS);
  sky.name = SKY_NAME;
  scene.add(sky, new THREE.HemisphereLight(0x5a6470, 0x15180f, 0.6));
  const middle = -BANK_LENGTH / 2 + 10;
  // Ground and water run far past the walkable strip so fog, not an edge, ends the view.
  const ground = plane(120, 360, 0x2b2f24);
  ground.position.set(RIVER_X - RIVER_WIDTH / 2 - 60, 0, middle);
  const farBank = plane(80, 360, 0x24271f);
  farBank.position.set(RIVER_X + RIVER_WIDTH / 2 + 40, 0, middle);
  const water = plane(RIVER_WIDTH, 360, 0x0b161b);
  water.position.set(RIVER_X, -0.15, middle);
  for (const surface of [ground, farBank, water]) surface.receiveShadow = true;
  scene.add(ground, farBank, water);
  await addSkyline(scene);
  const crateMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3b2a });
  for (const [x, z, size] of CRATES) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMaterial);
    crate.position.set(x, size / 2, z);
    enableShadows(crate);
    scene.add(crate);
  }
  return scene;
}
```

`src/dreams/follow-the-river/flashlight.ts`:
```ts
import * as THREE from 'three/webgpu';

/** Brightness (candela), reach (m) and cone half-angle (rad). Tuning knobs. */
export const FLASHLIGHT = { intensity: 80, distance: 22, angle: 0.45, penumbra: 0.5 } as const;

/** A torch held at the camera, pointing where the player looks. */
export function createFlashlight(camera: THREE.Camera): THREE.SpotLight {
  const light = new THREE.SpotLight(
    0xfff1d6,
    FLASHLIGHT.intensity,
    FLASHLIGHT.distance,
    FLASHLIGHT.angle,
    FLASHLIGHT.penumbra,
    2,
  );
  light.position.set(0.2, -0.15, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0005;
  light.target.position.set(0, -0.3, -1);
  camera.add(light, light.target);
  return light;
}
```

`src/dreams/follow-the-river/index.ts`. The flashlight hint fires through `ctx.read`, which pauses the game until the player continues:
```ts
import type * as THREE from 'three/webgpu';
import type { DreamContext, DreamModule } from '../types';
import { createFlashlight } from './flashlight';
import { buildRiverbank, riverbankColliders, SKY_NAME, SPAWN } from './riverbank';

/** Plan 1 grey box: proves walking, collisions, darkness and the flashlight. Plan 2 replaces it. */
export function createDream(): DreamModule {
  let flashlight: THREE.SpotLight | null = null;
  let stop: (() => void) | null = null;
  let camera: THREE.Camera | null = null;
  return {
    async start(ctx: DreamContext) {
      const scene = await buildRiverbank();
      camera = ctx.stage.camera;
      scene.add(camera);
      ctx.stage.scene = scene;
      const sky = scene.getObjectByName(SKY_NAME);
      ctx.player.colliders = riverbankColliders();
      ctx.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
      const light = createFlashlight(camera);
      flashlight = light;
      let toldAboutLight = false;
      stop = ctx.stage.addUpdater(() => {
        // Keep the sky centred on the player so it never ends, wherever they walk.
        sky?.position.set(ctx.stage.camera.position.x, 0, ctx.stage.camera.position.z);
        // Drop key taps made while reading or paused, so they don't fire on resume.
        if (ctx.isPaused()) {
          ctx.keys.consumePress('KeyF');
          return;
        }
        if (ctx.keys.consumePress('KeyF')) light.visible = !light.visible;
        if (!toldAboutLight && camera && camera.position.z < -8) {
          toldAboutLight = true;
          ctx.read(['It is getting dark. Press F to turn your flashlight on or off.']);
        }
      });
    },
    dispose() {
      stop?.();
      if (flashlight && camera) camera.remove(flashlight, flashlight.target);
      camera?.removeFromParent();
    },
  };
}
```

- [ ] **Step 7: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 61 passed`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(follow-the-river): riverbank with Blender-built skyline, sky dome and flashlight" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Home scene pieces — bedroom, Zzz, dream cloud, flow

**Files:**
- Create: `src/home/zzz.ts`, `src/home/zzzSprites.ts`, `src/home/bedroom.ts`, `src/home/cloud.ts`, `src/home/flow.ts`
- Test: `src/home/zzz.test.ts`, `src/home/cloud.test.ts`, `src/home/flow.test.ts`

**Interfaces:**
- Consumes: `loadModel` (Task 7), `Stage` (Task 2).
- Produces:
  - `ZZZ`, `zzzFrame(t): ZzzFrame`, `createZzz(scene, origin): ZzzEmitter`
  - `FURNITURE_SCALE`, `Bedroom { scene; head: THREE.Vector3; view: { position; target } }`, `buildBedroom(): Promise<Bedroom>`
  - `easeInOutCubic(t)`, `addDreamCloud(scene, center)`, `CameraPose`, `tweenCamera(stage, from, to, seconds): Promise<void>`
  - `HomeState`, `HomeEvent`, `nextHomeState(state, event)`

- [ ] **Step 1: Write the failing tests**

`src/home/zzz.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ZZZ, zzzFrame } from './zzz';

describe('zzzFrame', () => {
  it('is born invisible at the head', () => {
    expect(zzzFrame(0)).toMatchObject({ rise: 0, opacity: 0 });
  });

  it('is fully visible shortly after birth', () => {
    expect(zzzFrame(0.15).opacity).toBeCloseTo(1);
  });

  it('ends invisible at the top of its rise', () => {
    const end = zzzFrame(1);
    expect(end.opacity).toBeCloseTo(0);
    expect(end.rise).toBeCloseTo(ZZZ.rise);
  });

  it('always rises and grows over time', () => {
    expect(zzzFrame(0.6).rise).toBeGreaterThan(zzzFrame(0.3).rise);
    expect(zzzFrame(0.6).scale).toBeGreaterThan(zzzFrame(0.3).scale);
  });
});
```

`src/home/cloud.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { easeInOutCubic } from './cloud';

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1, passes the middle at 0.5', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it('clamps outside 0..1', () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});
```

`src/home/flow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { nextHomeState } from './flow';

describe('nextHomeState', () => {
  it('walks from sleeping to playing', () => {
    let state = nextHomeState('sleeping', 'start');
    state = nextHomeState(state, 'risen');
    state = nextHomeState(state, 'pick');
    state = nextHomeState(state, 'confirm');
    expect(nextHomeState(state, 'loaded')).toBe('playing');
  });

  it('returns to the dream cards when loading fails', () => {
    expect(nextHomeState('loading', 'load-failed')).toBe('picking');
  });

  it('lets the player back out of the content warning', () => {
    expect(nextHomeState('warning', 'back')).toBe('picking');
  });

  it('ignores a second Start click while rising', () => {
    expect(nextHomeState('rising', 'start')).toBe('rising');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/home`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/home/zzz.ts`:
```ts
/** Timing and motion of the "Z" letters rising from the sleeper. Tuning knobs. */
export const ZZZ = { every: 1.4, lifetime: 3.6, rise: 0.9, sway: 0.12 } as const;

export interface ZzzFrame {
  rise: number;
  sway: number;
  opacity: number;
  scale: number;
}

/** Pose of one Z at `t` (0 = just born, 1 = gone): fades in fast, drifts up, fades out slowly. */
export function zzzFrame(t: number): ZzzFrame {
  const c = Math.min(1, Math.max(0, t));
  const opacity = c < 0.15 ? c / 0.15 : 1 - (c - 0.15) / 0.85;
  return {
    rise: ZZZ.rise * c,
    sway: ZZZ.sway * Math.sin(c * Math.PI * 2),
    opacity,
    scale: 0.15 + 0.2 * c,
  };
}
```

`src/home/zzzSprites.ts`:
```ts
import * as THREE from 'three/webgpu';
import { ZZZ, zzzFrame } from './zzz';

function letterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    g.font = 'bold 52px Georgia, serif';
    g.fillStyle = '#cfd8ff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Z', 32, 34);
  }
  return new THREE.CanvasTexture(canvas);
}

export interface ZzzEmitter {
  update(dt: number): void;
  dispose(): void;
}

/** Spawns a Z above `origin` every ZZZ.every seconds; each one rises, sways and fades. */
export function createZzz(scene: THREE.Scene, origin: THREE.Vector3): ZzzEmitter {
  const texture = letterTexture();
  const live: { sprite: THREE.Sprite; age: number }[] = [];
  let clock: number = ZZZ.every;
  return {
    update(dt) {
      clock += dt;
      if (clock >= ZZZ.every) {
        clock = 0;
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          fog: false,
        });
        const sprite = new THREE.Sprite(material);
        scene.add(sprite);
        live.push({ sprite, age: 0 });
      }
      for (const z of live) {
        z.age += dt;
        const f = zzzFrame(z.age / ZZZ.lifetime);
        z.sprite.position.set(origin.x + f.sway, origin.y + 0.15 + f.rise, origin.z);
        z.sprite.scale.setScalar(f.scale);
        z.sprite.material.opacity = f.opacity;
      }
      while (live.length > 0 && live[0].age >= ZZZ.lifetime) {
        const dead = live.shift();
        dead?.sprite.removeFromParent();
        dead?.sprite.material.dispose();
      }
    },
    dispose() {
      for (const z of live) {
        z.sprite.removeFromParent();
        z.sprite.material.dispose();
      }
      live.length = 0;
      texture.dispose();
    },
  };
}
```

`src/home/bedroom.ts`. Placements were tuned by screenshot. The room is fully closed (four walls, ceiling, night sky dome outside the window), so there is no black void. The sleeper uses smooth, high-segment shapes. The lamp casts shadows; the lamp model itself only receives them, because it surrounds its own light. The camera looks across the moonlit floor at the bed under the window, with the lamp glowing on the nightstand:
```ts
import * as THREE from 'three/webgpu';
import { enableShadows, loadModel } from '../engine/models';
import { createSkyDome } from '../engine/sky';

/** Kenney furniture is modelled small; ×2 makes the bed ~2.3 m long and walls ~2.6 m tall. Tuning knob. */
export const FURNITURE_SCALE = 2;
/** Floor tiles are 0.1 m thick after scaling; furniture stands on top. */
const FLOOR_Y = 0.1;
/** Kenney walls are 1.29 tall; scaled, the ceiling sits here. */
const CEILING_Y = 1.29 * FURNITURE_SCALE;
const NIGHT = 0x04060b;

/** [file, x, y, z, rotationY]. Kenney origins sit at a model corner (x ≥ 0, z ≤ 0). */
type Placement = readonly [string, number, number, number, number];

const PIECES: readonly Placement[] = [
  ['floorFull', 0, 0, 0, 0],
  ['floorFull', 2, 0, 0, 0],
  ['floorFull', 4, 0, 0, 0],
  ['floorFull', 0, 0, -2, 0],
  ['floorFull', 2, 0, -2, 0],
  ['floorFull', 4, 0, -2, 0],
  ['wallWindow', 0, 0, -4, 0],
  ['wall', 2, 0, -4, 0],
  ['wall', 4, 0, -4, 0],
  ['wall', 0, 0, 0, Math.PI / 2],
  ['wall', 0, 0, -2, Math.PI / 2],
  ['wall', 6, 0, -2, -Math.PI / 2],
  ['wall', 6, 0, -4, -Math.PI / 2],
  ['wall', 2, 0, 0, Math.PI],
  ['wall', 4, 0, 0, Math.PI],
  ['wall', 6, 0, 0, Math.PI],
  ['bedSingle', -0.6, FLOOR_Y, -1.74, 0],
  ['cabinetBedDrawerTable', 1.45, FLOOR_Y, -3.58, 0],
  ['lampRoundTable', 1.55, FLOOR_Y + 0.52, -3.62, 0],
  ['rugRound', 2.2, FLOOR_Y, -1.0, 0],
  ['books', 2.6, FLOOR_Y, -3.4, 0.3],
];

export interface Bedroom {
  scene: THREE.Scene;
  /** Where the sleeper's head rests; the Zzz rise from here. */
  head: THREE.Vector3;
  view: { position: THREE.Vector3; target: THREE.Vector3 };
}

/** Kartik asleep: a head on the pillow and a blanket-covered body. Simple shapes, no character model. */
function sleeper(head: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 24, 16),
    new THREE.MeshLambertMaterial({ color: 0xc49a7c }),
  );
  face.position.copy(head);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 1.1, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0x2f3d5c }),
  );
  body.rotation.x = Math.PI / 2;
  body.position.set(head.x, head.y - 0.04, head.z + 0.85);
  group.add(face, body);
  enableShadows(group);
  return group;
}

/** Closes the room so no black void shows above the walls. */
function ceiling(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 4),
    new THREE.MeshLambertMaterial({ color: 0x2b2722 }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(3, CEILING_Y, -2);
  return mesh;
}

function lights(scene: THREE.Scene, head: THREE.Vector3): void {
  scene.add(new THREE.HemisphereLight(0x1c2438, 0x050506, 0.25));
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.2);
  moon.position.set(1, 4, -6);
  moon.target.position.copy(head);
  const lamp = new THREE.PointLight(0xffc58a, 2, 5, 2);
  lamp.position.set(1.67, FLOOR_Y + 0.95, -3.74);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.002;
  scene.add(moon, moon.target, lamp);
}

export async function buildBedroom(): Promise<Bedroom> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.Fog(NIGHT, 5, 16);
  const models = await Promise.all(PIECES.map(([file]) => loadModel(`/assets/home/${file}.glb`)));
  models.forEach((model, i) => {
    const [, x, y, z, rotationY] = PIECES[i];
    model.scale.setScalar(FURNITURE_SCALE);
    model.position.set(x, y, z);
    model.rotation.y = rotationY;
    // The lamp holds its own light; letting it cast would black out the room.
    if (PIECES[i][0] === 'lampRoundTable') enableShadows(model, false);
    scene.add(model);
  });
  const head = new THREE.Vector3(0.75, FLOOR_Y + 0.72, -3.55);
  // Night sky outside, seen through the window.
  scene.add(sleeper(head), ceiling(), createSkyDome(0x02030a, 0x101a33, 40));
  lights(scene, head);
  return {
    scene,
    head,
    view: {
      position: new THREE.Vector3(5.1, 1.7, -0.9),
      target: new THREE.Vector3(0.9, 0.9, -3.0),
    },
  };
}
```

`src/home/cloud.ts`:
```ts
import * as THREE from 'three/webgpu';
import type { Stage } from '../engine/stage';

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

function puffTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

/** A ring of soft violet puffs: the "dream cloud" the camera rises into. */
export function addDreamCloud(scene: THREE.Scene, center: THREE.Vector3): THREE.Group {
  const cloud = new THREE.Group();
  const material = new THREE.SpriteMaterial({
    map: puffTexture(),
    color: 0x6d5fa8,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    fog: false,
  });
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const puff = new THREE.Sprite(material);
    puff.position.set(
      center.x + Math.cos(angle) * 2.2,
      center.y + Math.sin(i * 1.7) * 0.6,
      center.z + Math.sin(angle) * 2.2,
    );
    puff.scale.setScalar(2.2 + (i % 3) * 0.6);
    cloud.add(puff);
  }
  scene.add(cloud);
  return cloud;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Glides the camera between two poses over `seconds`, easing in and out. */
export function tweenCamera(
  stage: Stage,
  from: CameraPose,
  to: CameraPose,
  seconds: number,
): Promise<void> {
  const target = new THREE.Vector3();
  let elapsed = 0;
  return new Promise((resolve) => {
    const stop = stage.addUpdater((dt) => {
      elapsed += dt;
      const t = easeInOutCubic(elapsed / seconds);
      stage.camera.position.lerpVectors(from.position, to.position, t);
      stage.camera.lookAt(target.lerpVectors(from.target, to.target, t));
      if (elapsed < seconds) return;
      stop();
      resolve();
    });
  });
}
```

`src/home/flow.ts`:
```ts
export type HomeState = 'sleeping' | 'rising' | 'picking' | 'warning' | 'loading' | 'playing';
export type HomeEvent = 'start' | 'risen' | 'pick' | 'back' | 'confirm' | 'load-failed' | 'loaded';

const NEXT: Record<HomeState, Partial<Record<HomeEvent, HomeState>>> = {
  sleeping: { start: 'rising' },
  rising: { risen: 'picking' },
  picking: { pick: 'warning' },
  warning: { back: 'picking', confirm: 'loading' },
  loading: { 'load-failed': 'picking', loaded: 'playing' },
  playing: {},
};

/** Home screen steps. Unknown events (double clicks, late callbacks) leave the state unchanged. */
export function nextHomeState(state: HomeState, event: HomeEvent): HomeState {
  return NEXT[state][event] ?? state;
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 71 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(home): bedroom, rising Zzz, dream cloud and home flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: App shell, home screen and boot

**Files:**
- Create: `src/app.ts`, `src/home/home.ts`
- Modify: `src/main.ts` (replace the temporary cube scene)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `App { stage; overlay; audio; keys; settings; saveSettings(settings) }`
  - `runDream(app, info, onQuit): Promise<string | null>`
  - `HomeHandle { dispose() }`, `type Play = (info) => Promise<string | null>`, `startHome(app, play): Promise<HomeHandle>`
  - Dev only: `window.kd` (the `App`) and the `?nolock` flag.

Behaviour to keep:
- Start enters fullscreen, unlocks audio and starts the room tone, all inside the click. The dream-card screen and the pause menu both have a "Full screen on/off" button. Players can also use the browser's own full screen (⌃⌘F in Chrome and Safari on Mac, F11 on Windows).
- `home.dispose()` must **not** close the overlay panel. The dream's intro pages are already open by then. (Found in the prototype: closing it here hid the intro.)
- `?nolock` (dev builds only) lets automated checks walk without pointer lock; Esc then opens the pause menu directly. Production builds strip both it and `window.kd` (checked: neither string is in `dist/`).
- Hidden tabs pause rendering (`requestAnimationFrame` stops), so the camera rise waits until the tab is visible. Keep the Chrome tab in front during browser checks.

- [ ] **Step 1: Implement**

`src/app.ts`:
```ts
import * as THREE from 'three/webgpu';
import { loadDream } from './dreams/load';
import type { DreamInfo } from './dreams/types';
import type { AudioBus } from './engine/audio';
import type { KeyState } from './engine/input';
import { screenAfter, type LockEvent, type Screen } from './engine/lock';
import { showPages, showPauseMenu } from './engine/menus';
import { createPlayer } from './engine/player';
import type { Settings } from './engine/settings';
import type { Stage } from './engine/stage';
import type { Overlay } from './engine/ui';

export interface App {
  stage: Stage;
  overlay: Overlay;
  audio: AudioBus;
  keys: KeyState;
  settings: Settings;
  saveSettings(settings: Settings): void;
}

/**
 * Dev-only `?nolock`: play without Pointer Lock so automated browser checks can walk around
 * (browsers refuse pointer lock to automated or unfocused windows). Never active in production.
 */
const NO_LOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('nolock');

/**
 * Loads and runs a dream with the shared player, pause menu and paged reader.
 * Resolves to an error message, or null once the dream is running.
 */
export async function runDream(
  app: App,
  info: DreamInfo,
  onQuit: () => void,
): Promise<string | null> {
  const result = await loadDream(info);
  if (!result.ok) return result.message;
  const { dream } = result;
  let screen: Screen = 'reader';
  let reading = false;
  const onLock = (event: LockEvent): void => {
    screen = screenAfter(event, reading);
    if (screen === 'game') app.overlay.closePanel();
    if (screen === 'pause-menu') showMenu();
  };
  const player = createPlayer(app.stage.camera, app.stage.renderer.domElement, app.keys, onLock);
  const lock = (): void => (NO_LOCK ? onLock('locked') : player.lock());
  // Without pointer lock the browser can't report Esc as an unlock, so do it here (dev only).
  const onEscape = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && screen === 'game') onLock('unlocked');
  };
  if (NO_LOCK) addEventListener('keydown', onEscape);
  player.setSensitivity(app.settings.sensitivity);
  const stopMove = app.stage.addUpdater((dt) => {
    if (screen === 'game') player.update(dt);
  });
  const cleanUp = (): void => {
    removeEventListener('keydown', onEscape);
    stopMove();
    dream.dispose();
    player.dispose();
    app.overlay.closePanel();
    app.stage.scene = new THREE.Scene();
  };
  const leave = (): void => {
    cleanUp();
    onQuit();
  };
  const showMenu = (): void =>
    showPauseMenu(app.overlay, {
      title: info.title,
      howToPlay: info.howToPlay,
      settings: app.settings,
      onResume: lock,
      onSettings: (settings) => {
        app.saveSettings(settings);
        player.setSensitivity(app.settings.sensitivity);
      },
      onQuit: leave,
    });
  const read = (pages: readonly string[]): void => {
    reading = true;
    screen = 'reader';
    player.unlock();
    showPages(app.overlay, pages, () => {
      reading = false;
      lock();
    });
  };
  try {
    await dream.start({
      stage: app.stage,
      overlay: app.overlay,
      audio: app.audio,
      keys: app.keys,
      player,
      read,
      isPaused: () => screen !== 'game',
    });
  } catch {
    // A model or sound failed to download: back to the dream cards with a message.
    cleanUp();
    return `Couldn't start "${info.title}". Check your internet connection and try again.`;
  }
  await app.overlay.fade(false);
  read(info.intro);
  return null;
}
```

`src/home/home.ts`:
```ts
import type * as THREE from 'three/webgpu';
import type { App } from '../app';
import { DREAMS } from '../dreams/registry';
import type { DreamInfo } from '../dreams/types';
import { roomToneBuffer } from '../engine/audio';
import { enterFullscreen, toggleFullscreen } from '../engine/fullscreen';
import { button, el } from '../engine/ui';
import { buildBedroom } from './bedroom';
import { addDreamCloud, tweenCamera } from './cloud';
import { nextHomeState, type HomeEvent, type HomeState } from './flow';
import { createZzz } from './zzzSprites';

export interface HomeHandle {
  dispose(): void;
}

/** Starts a dream; resolves to an error message, or null once the dream is running. */
export type Play = (info: DreamInfo) => Promise<string | null>;

export async function startHome(app: App, play: Play): Promise<HomeHandle> {
  const { stage, overlay, audio } = app;
  const room = await buildBedroom();
  stage.scene = room.scene;
  stage.camera.position.copy(room.view.position);
  stage.camera.lookAt(room.view.target);
  const zzz = createZzz(room.scene, room.head);
  const stopZzz = stage.addUpdater((dt) => zzz.update(dt));
  let state: HomeState = 'sleeping';
  let tone: THREE.Audio | null = null;
  const send = (event: HomeEvent): boolean => {
    const next = nextHomeState(state, event);
    if (next === state) return false;
    state = next;
    return true;
  };

  const showCards = (message?: string): void => {
    overlay.panel((panel) => {
      panel.append(el('h1', '', 'Choose a dream'));
      if (message) panel.append(el('p', 'error', message));
      for (const info of DREAMS) {
        const card = button('', () => send('pick') && showWarning(info), 'card');
        card.append(
          el('strong', '', info.title),
          el('span', '', `${info.minutes} min · ${info.warnings.join(' · ')}`),
        );
        panel.append(card);
      }
      panel.append(button('Full screen on/off', toggleFullscreen, 'btn quiet'));
    });
  };

  const showWarning = (info: DreamInfo): void => {
    overlay.panel((panel) => {
      panel.append(
        el('h1', '', info.title),
        el('p', 'big', `This dream contains: ${info.warnings.join(', ')}.`),
        el('p', '', 'Headphones recommended. Play somewhere quiet.'),
        button('Enter the dream', () => void enter(info), 'btn primary'),
        button('Back', () => send('back') && showCards(), 'btn quiet'),
      );
    });
  };

  const enter = async (info: DreamInfo): Promise<void> => {
    if (!send('confirm')) return;
    overlay.closePanel();
    await overlay.fade(true);
    const error = await play(info);
    if (error === null) return void send('loaded');
    send('load-failed');
    await overlay.fade(false);
    showCards(error);
  };

  const rise = async (): Promise<void> => {
    if (!send('start')) return;
    overlay.closePanel();
    enterFullscreen();
    audio.unlock().catch(() => undefined);
    tone = audio.loop(roomToneBuffer(audio.listener.context), 0.25);
    const center = room.head.clone().setY(6);
    addDreamCloud(room.scene, center);
    const to = {
      position: room.head
        .clone()
        .setY(3.2)
        .setZ(room.head.z + 0.6),
      target: center,
    };
    await tweenCamera(stage, room.view, to, 3.5);
    send('risen');
    showCards();
  };

  overlay.panel((panel) => {
    panel.classList.add('low');
    panel.append(
      el('h1', 'title', "Kartik's Dreams"),
      el('p', 'big', 'Every dream here really happened.'),
      button('Start', () => void rise(), 'btn primary'),
    );
  });

  return {
    dispose() {
      stopZzz();
      zzz.dispose();
      tone?.stop();
    },
  };
}
```

`src/main.ts`:
```ts
import { runDream, type App } from './app';
import { createAudioBus } from './engine/audio';
import { isDesktop } from './engine/device';
import { KeyState } from './engine/input';
import { showMessage, showUnsupported } from './engine/menus';
import { browserStorage, createSaveStore } from './engine/save';
import { clampSettings, isSettings, loadSettings } from './engine/settings';
import { createStage, type Stage } from './engine/stage';
import { createOverlay } from './engine/ui';
import { startHome } from './home/home';
import './style.css';

const HOME_FAILED =
  "Couldn't load the bedroom. Check your internet connection and reload the page.";

async function tryStage(root: HTMLElement): Promise<Stage | null> {
  try {
    return await createStage(root);
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  const overlayRoot = document.getElementById('overlay');
  if (!root || !overlayRoot) throw new Error('index.html needs #app and #overlay');
  const overlay = createOverlay(overlayRoot);
  if (!isDesktop((query) => window.matchMedia(query))) return showUnsupported(overlay);
  const stage = await tryStage(root);
  if (!stage) {
    return showMessage(
      overlay,
      "Kartik's Dreams",
      'Your browser could not start 3D graphics. Try the latest Chrome or Safari.',
    );
  }
  document.documentElement.dataset.backend = stage.backend;
  const keys = new KeyState();
  keys.attach(window);
  const store = createSaveStore(browserStorage(), 'settings', isSettings);
  const audio = createAudioBus(stage.camera);
  const app: App = {
    stage,
    overlay,
    audio,
    keys,
    settings: loadSettings(store),
    saveSettings(settings) {
      app.settings = clampSettings(settings);
      store.save(app.settings);
      audio.setVolume(app.settings.volume);
    },
  };
  audio.setVolume(app.settings.volume);
  // Dev-only handle for browser checks, e.g. `kd.stage.camera.position`.
  if (import.meta.env.DEV) Object.assign(window, { kd: app });
  const goHome = async (): Promise<void> => {
    try {
      const home = await startHome(app, async (info) => {
        const error = await runDream(app, info, () => void goHome());
        if (error === null) home.dispose();
        return error;
      });
    } catch {
      showMessage(overlay, "Kartik's Dreams", HOME_FAILED);
      await overlay.fade(false);
    }
  };
  await goHome();
}

void boot();
```

- [ ] **Step 2: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 71 passed`. The build shows a separate `follow-the-river-*.js` chunk.

- [ ] **Step 3: Confirm dev-only hooks are stripped from production**

Run: `grep -c "nolock" dist/assets/*.js`
Expected: every file reports `0`.

- [ ] **Step 4: [controller] Full flow in Chrome — WebGPU**

With `pnpm run dev` running, open `http://localhost:5173/?nolock` and check:
1. Home: dark bedroom, lamp glow, a sleeper on the bed with Z's rising, and a "Kartik's Dreams" panel at the bottom with Start. No console errors.
2. Click Start (JS click is fine in `?nolock`). Within about 5 s the camera rises into a violet cloud and the "Choose a dream" panel lists "Follow the River · 12 min · Horror · Jumpscares · Loud sounds".
3. Click the card. The warning panel appears with "Enter the dream" and "Back". Back returns to the cards; then enter.
4. Intro pages: "1 / 4". Press Enter → "2 / 4". Press ← → "1 / 4" with Back disabled. Click Skip.
5. Walk: dispatch `keydown`/`keyup` for `KeyW` 1.5 s apart, then read `kd.stage.camera.position.z`. Expected ≈ -3.3 (2.2 m/s).
6. Hold W+Shift until z < -8. The page "It is getting dark. Press F…" opens and the game pauses.
7. Turn the camera toward the river (`kd.stage.camera.rotation.set(0.05, -1.2, 0, 'YXZ')`). The screenshot shows Blender concrete blocks with a few lit windows across the river, fading into fog. Turn the other way (`… 1.2 …`) and you see pines and dead trees. The flashlight cone is on the ground and there is no visible world edge.

- [ ] **Step 5: [controller] Quit, re-enter and settings round trip**

Still on `?nolock`:
1. Press Esc (dispatch `keydown` `Escape`). The pause menu titled "Follow the River" appears.
2. Click "Quit to dreams". The bedroom and Start panel return.
3. Start → card → Enter the dream → Skip a second time. `kd.stage.camera.children.map((c) => c.type)` lists exactly one `AudioListener` and one `SpotLight` (plus its target `Object3D`). Nothing is duplicated.
4. Walk 1 s with W. z changes by about -2.2. Esc again shows the menu.
5. Run `kd.saveSettings({ sensitivity: 2, volume: 0.5 })` and reload the page. `kd.settings` is `{ sensitivity: 2, volume: 0.5 }`. Then run `localStorage.setItem('kartiks-dreams:settings', '{broken')` and reload. `kd.settings` is the default `{ sensitivity: 1, volume: 0.8 }` and there are no console errors.

- [ ] **Step 6: [controller] Same flow on WebGL 2**

Open `http://localhost:5173/?nolock&webgl`. Expected: `document.documentElement.dataset.backend === 'webgl2'` and the same visuals.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: app shell, home screen flow and boot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Graphics pass — sharper render, bloom, vignette, grain and shadows

Kartik asked for better graphics that look "not too polygon-y". The prototype was checked in Chrome on 2026-10-03. Lamps and lit windows glow, edges darken, a light film grain adds texture, and the lamp and flashlight cast soft shadows. The render is less chunky: 540 rows instead of 360.

**Files:**
- Create: `src/engine/post.ts`
- Modify: `src/engine/stage.ts` (whole file below)

**Interfaces:**
- Consumes: `Stage` (Task 2). Its interface does not change.
- Produces: `POST` (tuning knobs), `Post { render(scene): void; dispose(): void }`, `createPost(renderer, camera): Post`. `RENDER_HEIGHT` becomes 540, and the stage enables PCF shadow maps.

Facts verified against the installed three.js:
- `THREE.RenderPipeline` replaced `PostProcessing`.
- `bloom` comes from `three/addons/tsl/display/BloomNode.js`, `film` from `three/addons/tsl/display/FilmNode.js`, and `pass`, `screenUV`, `smoothstep`, `uniform`, `float` from `three/tsl`.
- `PassNode.scene` is writable, so the stage can swap scenes.
- `PCFSoftShadowMap` is deprecated, so use `PCFShadowMap`.

- [ ] **Step 1: 🔎 Confirm the post-processing exports in the installed version**

```bash
test -f node_modules/three/examples/jsm/tsl/display/BloomNode.js && test -f node_modules/three/examples/jsm/tsl/display/FilmNode.js && echo nodes-ok
grep -c "declare class RenderPipeline" node_modules/@types/three/src/renderers/common/RenderPipeline.d.ts
grep -n "scene: Object3D" node_modules/@types/three/src/nodes/display/PassNode.d.ts
```
Expected: `nodes-ok`, `1`, and one line. If an export moved in a newer three.js, use the `webgpu-threejs-tsl` skill and Context7 to find its new home before writing code.

- [ ] **Step 2: Write `src/engine/post.ts`**

```ts
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { float, pass, screenUV, smoothstep, uniform } from 'three/tsl';
import * as THREE from 'three/webgpu';

/** Horror look. Tuning knobs. */
export const POST = {
  /** Glow around lamps, lit windows and the flashlight. */
  bloomStrength: 0.55,
  bloomRadius: 0.45,
  /** Only pixels brighter than this glow. */
  bloomThreshold: 0.7,
  /** 0 = no dark edges; 1 = heavy tunnel vision. */
  vignette: 0.85,
  /** Film grain amount. */
  grain: 0.18,
} as const;

export interface Post {
  /** Draws `scene` through bloom, vignette and grain. */
  render(scene: THREE.Scene): void;
  dispose(): void;
}

/** Screen-space effects on top of the low-res render. Works on WebGPU and WebGL 2 (TSL). */
export function createPost(renderer: THREE.WebGPURenderer, camera: THREE.Camera): Post {
  const scenePass = pass(new THREE.Scene(), camera);
  const color = scenePass.getTextureNode('output');
  const glow = bloom(color, POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold);
  const edge = smoothstep(float(0.75), float(0.2), screenUV.sub(0.5).length());
  const dark = float(1).sub(float(POST.vignette).mul(float(1).sub(edge)));
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputNode = film(color.add(glow).mul(dark), uniform(POST.grain));
  return {
    render(scene) {
      scenePass.scene = scene;
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
    },
  };
}
```

- [ ] **Step 3: Replace `src/engine/stage.ts`**

```ts
import * as THREE from 'three/webgpu';
import { createPost } from './post';
import { internalResolution } from './resolution';
import { clampDelta } from './time';

/** Rows rendered per frame before upscaling. Lower = chunkier, retro look. Tuning knob. */
export const RENDER_HEIGHT = 540;

export type Backend = 'webgpu' | 'webgl2';
export type Updater = (dt: number) => void;

export interface Stage {
  readonly renderer: THREE.WebGPURenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly backend: Backend;
  /** The scene being drawn; home and dreams swap it. */
  scene: THREE.Scene;
  /** Run `fn(dt)` every frame; call the returned function to stop. */
  addUpdater(fn: Updater): () => void;
  dispose(): void;
}

function fit(renderer: THREE.WebGPURenderer, camera: THREE.PerspectiveCamera): void {
  const { width, height } = internalResolution(innerWidth, innerHeight, RENDER_HEIGHT);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/** Creates the one renderer the whole app shares. `?webgl` in the URL forces the WebGL 2 backend. */
export async function createStage(container: HTMLElement): Promise<Stage> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
  const post = createPost(renderer, camera);
  const updaters = new Set<Updater>();
  const timer = new THREE.Timer();
  timer.connect(document);
  const onResize = (): void => fit(renderer, camera);
  addEventListener('resize', onResize);
  onResize();
  const stage: Stage = {
    renderer,
    camera,
    backend: 'isWebGPUBackend' in renderer.backend ? 'webgpu' : 'webgl2',
    scene: new THREE.Scene(),
    addUpdater(fn) {
      updaters.add(fn);
      return () => {
        updaters.delete(fn);
      };
    },
    dispose() {
      void renderer.setAnimationLoop(null);
      removeEventListener('resize', onResize);
      timer.dispose();
      post.dispose();
      void renderer.dispose();
      renderer.domElement.remove();
    },
  };
  await renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = clampDelta(timer.getDelta());
    for (const fn of updaters) fn(dt);
    post.render(stage.scene);
  });
  return stage;
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 71 passed`. The pure logic is untouched; rendering is checked in the next step.

- [ ] **Step 5: [controller] Browser check on both backends**

With `pnpm run dev` running, open `http://localhost:5173/?nolock`:
1. Home screen: the lamp has a soft glow (bloom), the bed casts a shadow on the wall, the screen edges are darker, a faint grain is visible, and there are no console errors.
2. Enter the dream and skip the intro, then run `kd.stage.camera.rotation.set(0.04, -1.15, 0, 'YXZ')`. Lit windows across the river glow.
3. Run `kd.stage.camera.rotation.set(-0.05, 0.25, 0, 'YXZ')`. The crate in the flashlight cone is lit and casts a shadow.
4. Repeat 1–3 on `?nolock&webgl`. The visuals match, and `document.documentElement.dataset.backend === 'webgl2'`.

If anything is too bright for the "never bright" rule, lower `POST.bloomStrength` or raise `POST.bloomThreshold`, then re-check.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): graphics pass — 540p render, bloom, vignette, film grain, soft shadows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Atmosphere and the first scare

Kartik asked for real horror, a quiet home screen and a river that visibly flows. Everything here was checked in Chrome on 2026-10-03.
- Home: the static/rain-like room tone is replaced by soft, slow sleep breathing at low volume.
- River: wider (14 m) and clearly visible. Blue ripples drift downstream and glint under dim moonlight and the flashlight, and a pale mud edge marks the bank. It is all done in a TSL shader, with no per-frame JavaScript.
- Scare kit (reusable in Plan 2): a procedural sting sound, a camera jolt and a light flicker.
- The watcher: a Blender-built figure, too tall and too thin, with faint red eyes. It stands in the fog on the path. Walk within 13 m and the sting hits, the camera jolts, the flashlight stutters, and the figure is gone.

**Files:**
- Create: `src/engine/scare.ts`, `src/dreams/follow-the-river/watcher.ts`, `src/dreams/follow-the-river/water.ts`, `src/home/breath.ts`, `public/assets/river/watcher.glb` (generated)
- Modify: `tools/blender/river_props.py` (whole file below), `src/engine/audio.ts` (whole file: adds `once`, drops the unused brown-noise room tone), `src/dreams/follow-the-river/riverbank.ts` (whole file), `src/dreams/follow-the-river/index.ts` (whole file), `src/home/home.ts` (whole file), `public/assets/LICENSES.md` (river row)
- Delete: `src/engine/audio.test.ts` (it only tested the removed brown noise)
- Test: `src/engine/scare.test.ts`, `src/dreams/follow-the-river/watcher.test.ts`, `src/home/breath.test.ts`

**Interfaces:**
- Consumes: `loadModel` (Task 7), `AudioBus` (Task 6), `FLASHLIGHT` (Task 9), riverbank colliders/`SPAWN` (Task 9).
- Produces:
  - `SHAKE_SECONDS`, `FLICKER_SECONDS`, `shakeAt(elapsed)`, `flickerOn(elapsed)`, `stingSamples(sampleRate, seconds?, random?)`, `stingBuffer(context, seconds?)`
  - `AudioBus.once(buffer, volume)` (`roomToneBuffer` and `brownNoise` are removed)
  - `WATCHER`, `WatcherState`, `shouldStrike(state, distance)`, `loadWatcherFigure()`
  - `RIVER_FLOW`, `createRiverMaterial()`
  - `BREATH`, `BREATH_SECONDS`, `breathEnvelope(t)`, `breathSamples(sampleRate, random?)`, `breathBuffer(context)`

- [ ] **Step 1: 🔎 Confirm the TSL nodes the river uses exist in the installed three.js**

```bash
grep -c "export const mx_noise_float" node_modules/@types/three/src/nodes/materialx/MaterialXNodes.d.ts
grep -c "export const positionWorld" node_modules/@types/three/src/nodes/accessors/Position.d.ts
grep -c "export const time" node_modules/@types/three/src/nodes/utils/Timer.d.ts
```
Expected: `1` three times. If something moved, find its new home with the `webgpu-threejs-tsl` skill or Context7 before writing code.

- [ ] **Step 2: Write the failing tests**

`src/engine/scare.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FLICKER_SECONDS, flickerOn, SHAKE_SECONDS, shakeAt, stingSamples } from './scare';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('shakeAt', () => {
  it('hits hardest at the moment of the scare and stops after', () => {
    expect(shakeAt(0)).toBe(1);
    expect(shakeAt(SHAKE_SECONDS / 2)).toBeCloseTo(0.25);
    expect(shakeAt(SHAKE_SECONDS)).toBe(0);
  });

  it('is still before the scare and for broken times', () => {
    expect(shakeAt(-1)).toBe(0);
    expect(shakeAt(Number.NaN)).toBe(0);
  });
});

describe('flickerOn', () => {
  it('stutters off and on right after the scare', () => {
    const states = new Set([0, 0.08, 0.15, 0.22, 0.3].map(flickerOn));
    expect(states).toEqual(new Set([true, false]));
  });

  it('stays on once the flicker is over', () => {
    expect(flickerOn(FLICKER_SECONDS)).toBe(true);
    expect(flickerOn(10)).toBe(true);
  });
});

describe('stingSamples', () => {
  it('is loud at the start, silent-ish at the end, and never clips past -1..1', () => {
    const samples = stingSamples(8000, 1.4, seeded(3));
    const peak = (from: number, to: number): number =>
      samples.slice(from, to).reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(samples.length).toBe(11200);
    expect(peak(0, 800)).toBeGreaterThan(0.5);
    expect(peak(10400, 11200)).toBeLessThan(0.1);
    expect(peak(0, samples.length)).toBeLessThanOrEqual(1);
  });
});
```

`src/dreams/follow-the-river/watcher.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveCircle } from '../../engine/collide';
import { PLAYER_RADIUS } from '../../engine/player';
import { riverbankColliders, SPAWN } from './riverbank';
import { shouldStrike, WATCHER } from './watcher';

describe('watcher', () => {
  it('waits while the player is far away', () => {
    expect(shouldStrike('waiting', WATCHER.trigger + 1)).toBe(false);
  });

  it('strikes once the player comes within reach', () => {
    expect(shouldStrike('waiting', WATCHER.trigger - 1)).toBe(true);
  });

  it('never strikes twice', () => {
    expect(shouldStrike('struck', 0)).toBe(false);
  });

  it('starts out of reach of the spawn point', () => {
    const distance = Math.hypot(WATCHER.x - SPAWN.x, WATCHER.z - SPAWN.z);
    expect(shouldStrike('waiting', distance)).toBe(false);
  });

  it('stands on open ground the player can walk up to', () => {
    expect(resolveCircle(WATCHER.x, WATCHER.z, PLAYER_RADIUS, riverbankColliders())).toEqual({
      x: WATCHER.x,
      z: WATCHER.z,
    });
  });
});
```

`src/home/breath.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BREATH, BREATH_SECONDS, breathEnvelope, breathSamples } from './breath';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('breathEnvelope', () => {
  it('is silent at both ends of the cycle, so the loop never clicks', () => {
    expect(breathEnvelope(0)).toBe(0);
    expect(breathEnvelope(BREATH_SECONDS - 0.001)).toBe(0);
  });

  it('breathes in, pauses, then breathes out louder', () => {
    const inhalePeak = breathEnvelope(BREATH.inhale / 2);
    const pause = breathEnvelope(BREATH.inhale + BREATH.pause / 2);
    const exhalePeak = breathEnvelope(BREATH.inhale + BREATH.pause + BREATH.exhale / 2);
    expect(inhalePeak).toBeGreaterThan(0.4);
    expect(pause).toBe(0);
    expect(exhalePeak).toBeGreaterThan(inhalePeak);
  });
});

describe('breathSamples', () => {
  it('is one cycle long, stays in range and is quiet at the loop point', () => {
    const samples = breathSamples(8000, seeded(5));
    const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(samples.length).toBe(Math.floor(8000 * BREATH_SECONDS));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.01);
    expect(Math.abs(samples[0])).toBeLessThan(0.001);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.001);
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `pnpm vitest run src/engine/scare.test.ts src/dreams/follow-the-river/watcher.test.ts src/home/breath.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the pure modules**

`src/engine/scare.ts`:
```ts
/** How long the camera jolts after a scare, in seconds. Tuning knob. */
export const SHAKE_SECONDS = 0.6;
/** How long the light stutters after a scare, in seconds. Tuning knob. */
export const FLICKER_SECONDS = 1.2;

/** Jolt strength `elapsed` seconds after a scare: 1 at the hit, easing to 0. */
export function shakeAt(elapsed: number): number {
  if (!(elapsed >= 0) || elapsed >= SHAKE_SECONDS) return 0;
  const left = 1 - elapsed / SHAKE_SECONDS;
  return left * left;
}

/** Whether a stuttering light is on `elapsed` seconds after a scare (always on once it settles). */
export function flickerOn(elapsed: number): boolean {
  if (!(elapsed >= 0) || elapsed >= FLICKER_SECONDS) return true;
  return Math.floor(elapsed * 14) % 3 === 2;
}

/**
 * A jumpscare sting: a harsh noise burst over a low, beating drone (55 Hz against 58.3 Hz).
 * Fades out over `seconds`. Values stay inside -1..1.
 */
export function stingSamples(
  sampleRate: number,
  seconds = 1.4,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const noise = (random() * 2 - 1) * Math.exp(-t * 10);
    const drone = 0.5 * (Math.sin(2 * Math.PI * 55 * t) + Math.sin(2 * Math.PI * 58.3 * t));
    const value = (noise * 0.9 + drone * 0.6) * Math.exp(-t * 2.5);
    samples[i] = Math.max(-1, Math.min(1, value));
  }
  return samples;
}

export function stingBuffer(context: BaseAudioContext, seconds = 1.4): AudioBuffer {
  const samples = stingSamples(context.sampleRate, seconds);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
```

`src/dreams/follow-the-river/watcher.ts`:
```ts
import type * as THREE from 'three/webgpu';
import { loadModel } from '../../engine/models';

/**
 * A tall figure standing still in the fog down the bank. Walk close and it is gone.
 * Position, trigger distance (m) and how long it stays after the sting (s). Tuning knobs.
 */
export const WATCHER = { x: 0.8, z: -44, trigger: 13, vanishAfter: 0.25 } as const;

export type WatcherState = 'waiting' | 'struck';

/** The scare fires once, the first time the player comes within reach. */
export function shouldStrike(state: WatcherState, distance: number): boolean {
  return state === 'waiting' && distance < WATCHER.trigger;
}

/**
 * The Blender-made figure (tools/blender/river_props.py `watcher`): too tall, too thin,
 * arms past the knees, a tilted head and two faintly glowing red eyes facing the player.
 */
export function loadWatcherFigure(): Promise<THREE.Object3D> {
  return loadModel('/assets/river/watcher.glb');
}
```

`src/home/breath.ts`:
```ts
/** One slow sleeping breath: in, a short pause, a longer sigh out, a rest. Seconds. Tuning knobs. */
export const BREATH = { inhale: 1.8, pause: 0.4, exhale: 2.4, rest: 1.2 } as const;
export const BREATH_SECONDS = BREATH.inhale + BREATH.pause + BREATH.exhale + BREATH.rest;

/** Loudness of the breath at time `t` within one cycle: silent at both ends so it loops cleanly. */
export function breathEnvelope(t: number): number {
  if (t < 0 || t >= BREATH_SECONDS) return 0;
  if (t < BREATH.inhale) return 0.55 * Math.sin((Math.PI * t) / BREATH.inhale) ** 2;
  const out = t - BREATH.inhale - BREATH.pause;
  if (out < 0 || out >= BREATH.exhale) return 0;
  return Math.sin((Math.PI * out) / BREATH.exhale) ** 2;
}

/**
 * One breath cycle of soft, airy noise (heavily smoothed so it whooshes instead of hissing),
 * shaped by `breathEnvelope`. Values stay inside -1..1.
 */
export function breathSamples(
  sampleRate: number,
  random: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(sampleRate * BREATH_SECONDS));
  const smoothing = Math.min(1, 900 / sampleRate);
  let air = 0;
  for (let i = 0; i < samples.length; i++) {
    air += smoothing * (random() * 2 - 1 - air);
    samples[i] = Math.max(-1, Math.min(1, air * 2.2 * breathEnvelope(i / sampleRate)));
  }
  return samples;
}

export function breathBuffer(context: BaseAudioContext): AudioBuffer {
  const samples = breathSamples(context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
```

Run the same three test files again. Expected: PASS (13 tests).

- [ ] **Step 5: Build the watcher in Blender**

Replace `tools/blender/river_props.py` with this version. It adds `limb()` and `watcher()`; the other props are unchanged:
```python
"""Builds the low-poly river scenery and exports one GLB per prop.

Run headless from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/river_props.py -- public/assets/river
"""

import math
import random
import sys
from pathlib import Path

import bpy

OUT = Path(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/assets/river")
random.seed(7)


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple, emission: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def box(name: str, size: tuple, location: tuple, mat: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    return obj


def join(objects: list, name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def export(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format="GLB")


def building(name: str, width: float, depth: float, height: float, lit_ratio: float) -> None:
    """Concrete block, rooftop box, rows of dark windows with a few still lit."""
    reset()
    wall = material("concrete", (0.09, 0.1, 0.11))
    dark = material("windowDark", (0.02, 0.025, 0.03))
    lit = material("windowLit", (1.0, 0.72, 0.35), emission=2.5)
    parts = [box("body", (width, depth, height), (0, 0, height / 2), wall)]
    parts.append(box("roof", (width * 0.4, depth * 0.4, 1.2), (width * 0.15, 0, height + 0.6), wall))
    floors = int(height // 3)
    columns = max(1, int(width // 2))
    for f in range(floors):
        for c in range(columns):
            x = -width / 2 + (c + 0.5) * width / columns
            z = 1.6 + f * 3
            glass = lit if random.random() < lit_ratio else dark
            parts.append(box("win", (0.9, 0.05, 1.2), (x, -depth / 2 - 0.02, z), glass))
    join(parts, name)
    export(name)


def pine(name: str, height: float) -> None:
    """Three stacked low-poly cones on a trunk."""
    reset()
    bark = material("bark", (0.06, 0.04, 0.03))
    needles = material("needles", (0.04, 0.07, 0.04))
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=10, radius=0.18, depth=height * 0.3, location=(0, 0, height * 0.15)
    )
    trunk = bpy.context.active_object
    trunk.data.materials.append(bark)
    parts = [trunk]
    for i in range(3):
        radius = height * (0.28 - i * 0.06)
        z = height * (0.3 + i * 0.22)
        bpy.ops.mesh.primitive_cone_add(
            vertices=12, radius1=radius, depth=height * 0.4, location=(0, 0, z + height * 0.2)
        )
        cone = bpy.context.active_object
        cone.rotation_euler[2] = random.random() * math.pi
        cone.data.materials.append(needles)
        parts.append(cone)
    join(parts, name)
    bpy.ops.object.shade_smooth()
    export(name)


def dead_tree(name: str, height: float) -> None:
    """A leafless trunk with crooked branches."""
    reset()
    bark = material("bark", (0.05, 0.04, 0.035))
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.15, depth=height, location=(0, 0, height / 2))
    parts = [bpy.context.active_object]
    for i in range(4):
        angle = i * math.pi / 2 + random.random() * 0.6
        length = height * 0.35
        z = height * (0.5 + i * 0.1)
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.06,
            depth=length,
            location=(math.cos(angle) * length / 3, math.sin(angle) * length / 3, z),
        )
        branch = bpy.context.active_object
        branch.rotation_euler = (math.sin(angle) * 0.9, -math.cos(angle) * 0.9, 0)
        parts.append(branch)
    for part in parts:
        part.data.materials.append(bark)
    join(parts, name)
    bpy.ops.object.shade_smooth()
    export(name)


def limb(radius: float, length: float, location: tuple, tilt: tuple = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius, depth=length, location=location)
    part = bpy.context.active_object
    part.rotation_euler = tilt
    return part


def watcher(name: str) -> None:
    """Too tall and too thin: arms hang past the knees, the head tilts, two eyes glow faint red.
    Faces Blender -Y, which exports as glTF +Z (towards a player walking down the bank)."""
    reset()
    shadow = material("shadow", (0.012, 0.012, 0.014))
    glow = material("eyes", (0.7, 0.03, 0.03), emission=4.0)
    parts = [limb(0.07, 1.2, (side * 0.11, 0, 0.6)) for side in (-1, 1)]
    torso = limb(0.16, 1.0, (0, 0, 1.68))
    torso.scale = (1.0, 0.6, 1.0)
    parts.append(torso)
    parts += [limb(0.045, 1.5, (side * 0.24, 0, 1.32), (0, side * 0.07, 0)) for side in (-1, 1)]
    parts.append(limb(0.05, 0.22, (0.02, 0, 2.25), (0.2, 0.15, 0)))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.15, location=(0.05, -0.04, 2.45))
    head = bpy.context.active_object
    head.scale = (0.85, 0.95, 1.2)
    head.rotation_euler = (0.25, 0.35, 0)
    parts.append(head)
    for part in parts:
        part.data.materials.append(shadow)
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.022, location=(0.05 + side * 0.055, -0.165, 2.47))
        eye = bpy.context.active_object
        eye.data.materials.append(glow)
        parts.append(eye)
    join(parts, name)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    bpy.ops.object.shade_smooth()
    export(name)


building("buildingTall", 6, 6, 27, 0.08)
building("buildingMid", 8, 6, 15, 0.12)
building("buildingLow", 10, 7, 9, 0.18)
pine("pine", 9)
dead_tree("deadTree", 7)
watcher("watcher")
print("EXPORTED", sorted(p.name for p in OUT.glob("*.glb")))
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/river_props.py -- public/assets/river | grep EXPORTED
```
Expected: `EXPORTED ['buildingLow.glb', 'buildingMid.glb', 'buildingTall.glb', 'deadTree.glb', 'pine.glb', 'watcher.glb']`. The script is deterministic, so the five existing GLBs may show as unchanged or byte-identical; commit whatever it writes.

In `public/assets/LICENSES.md`, change the river row's file list to `river/*.glb` (buildingTall, buildingMid, buildingLow, pine, deadTree, watcher).

- [ ] **Step 6: Wire it in**

Delete `src/engine/audio.test.ts`.

`src/engine/audio.ts`:
```ts
import * as THREE from 'three/webgpu';

export interface AudioBus {
  readonly listener: THREE.AudioListener;
  /** Browsers start audio suspended; call from a click handler. */
  unlock(): Promise<void>;
  setVolume(volume: number): void;
  loop(buffer: AudioBuffer, volume: number): THREE.Audio;
  /** Plays `buffer` once (a scare sting, a thud). */
  once(buffer: AudioBuffer, volume: number): void;
}

export function createAudioBus(camera: THREE.Camera): AudioBus {
  const listener = new THREE.AudioListener();
  camera.add(listener);
  return {
    listener,
    async unlock() {
      if (listener.context.state !== 'running') await listener.context.resume();
    },
    setVolume(volume) {
      listener.setMasterVolume(volume);
    },
    loop(buffer, volume) {
      const sound = new THREE.Audio(listener);
      sound.setBuffer(buffer);
      sound.setLoop(true);
      sound.setVolume(volume);
      sound.play();
      return sound;
    },
    once(buffer, volume) {
      const sound = new THREE.Audio(listener);
      sound.setBuffer(buffer);
      sound.setVolume(volume);
      // three's own onEnded resets isPlaying; keep it, then free the audio graph node.
      const ended = sound.onEnded.bind(sound);
      sound.onEnded = () => {
        ended();
        sound.disconnect();
      };
      sound.play();
    },
  };
}
```

`src/dreams/follow-the-river/water.ts`:
```ts
import { color, float, mix, mx_noise_float, positionWorld, time, vec3 } from 'three/tsl';
import * as THREE from 'three/webgpu';

/** Downstream speed in m/s and the water's colours. Tuning knobs. */
export const RIVER_FLOW = {
  speed: 1.6,
  deep: 0x0a1a26,
  streak: 0x5b8296,
  /** Faint self-glow of the ripples so the flow reads even outside the flashlight. */
  glow: 0x12303e,
} as const;

/**
 * Dark water whose long ripples drift downstream (towards -Z, the way the player must follow)
 * and glint where the flashlight hits them. All in the shader: no per-frame JavaScript.
 */
export function createRiverMaterial(): THREE.MeshStandardNodeMaterial {
  const downstream = positionWorld.z.add(time.mul(RIVER_FLOW.speed));
  const ripples = mx_noise_float(
    vec3(positionWorld.x.mul(1.1), downstream.mul(0.18), time.mul(0.2)),
  );
  const streaks = ripples.mul(0.5).add(0.5).pow(2);
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0.15 });
  material.colorNode = mix(color(RIVER_FLOW.deep), color(RIVER_FLOW.streak), streaks);
  material.roughnessNode = float(0.45).sub(streaks.mul(0.35));
  material.emissiveNode = color(RIVER_FLOW.glow).mul(streaks);
  return material;
}
```

`src/dreams/follow-the-river/riverbank.ts`:
```ts
import * as THREE from 'three/webgpu';
import { boxAt, type Box } from '../../engine/collide';
import { enableShadows } from '../../engine/models';
import { createSkyDome } from '../../engine/sky';
import { addSkyline } from './skyline';
import { createRiverMaterial } from './water';

/** Overcast dusk: dark grey-blue. Never bright. */
export const SKY = 0x1b2026;
/** The river: its near edge sits at x = 3, right beside the walkable bank. Tuning knobs. */
export const RIVER_WIDTH = 14;
export const RIVER_X = 3 + RIVER_WIDTH / 2;
/** Dim blue moonlight: just enough to put a sheen on the water. Never bright. */
const MOONLIGHT = 0.35;
export const BANK_LENGTH = 120;

/** Grey-box crates: [x, z, size]. Placeholder props until Plan 2's city kit. */
export const CRATES: ReadonlyArray<readonly [number, number, number]> = [
  [-2, -6, 1.2],
  [1.5, -11, 1],
  [-3.5, -17, 1.6],
  [0.5, -24, 1.1],
  [-1.5, -32, 1.4],
];

export const SPAWN = { x: 0, z: 0, yaw: 0 } as const;

/** Name of the sky dome, so the dream can keep it centred on the player. */
export const SKY_NAME = 'sky';

/**
 * The dome follows the player (see index.ts), so its far side is always 80 m away,
 * well inside the camera's 200 m far plane.
 */
const SKY_DOME_RADIUS = 80;

/** Crates, the river (no swimming yet) and the edges of the walkable strip. */
export function riverbankColliders(): Box[] {
  const crates = CRATES.map(([x, z, size]) => boxAt(x, z, size, size));
  const middle = -BANK_LENGTH / 2 + 10;
  return [
    ...crates,
    boxAt(RIVER_X, middle, RIVER_WIDTH, BANK_LENGTH),
    boxAt(-8, middle, 2, BANK_LENGTH),
    boxAt(0, 11, 24, 2),
    boxAt(0, -BANK_LENGTH + 9, 24, 2),
  ];
}

function plane(width: number, depth: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export async function buildRiverbank(): Promise<THREE.Scene> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 6, 70);
  const sky = createSkyDome(0x07090c, SKY, SKY_DOME_RADIUS);
  sky.name = SKY_NAME;
  const moon = new THREE.DirectionalLight(0x9fb4ff, MOONLIGHT);
  moon.position.set(40, 30, -80);
  scene.add(sky, new THREE.HemisphereLight(0x5a6470, 0x15180f, 0.6), moon);
  const middle = -BANK_LENGTH / 2 + 10;
  // Ground and water run far past the walkable strip so fog, not an edge, ends the view.
  const ground = plane(120, 360, 0x2b2f24);
  ground.position.set(RIVER_X - RIVER_WIDTH / 2 - 60, 0, middle);
  const farBank = plane(80, 360, 0x24271f);
  farBank.position.set(RIVER_X + RIVER_WIDTH / 2 + 40, 0, middle);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_WIDTH, 360), createRiverMaterial());
  water.rotation.x = -Math.PI / 2;
  water.position.set(RIVER_X, -0.15, middle);
  for (const surface of [ground, farBank, water]) surface.receiveShadow = true;
  // A pale strip of wet mud marks where the bank drops into the water.
  const edge = plane(0.6, 360, 0x4a4a3c);
  edge.position.set(RIVER_X - RIVER_WIDTH / 2 - 0.3, 0.01, middle);
  scene.add(ground, farBank, water, edge);
  await addSkyline(scene);
  const crateMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3b2a });
  for (const [x, z, size] of CRATES) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMaterial);
    crate.position.set(x, size / 2, z);
    enableShadows(crate);
    scene.add(crate);
  }
  return scene;
}
```

`src/dreams/follow-the-river/index.ts`:
```ts
import type * as THREE from 'three/webgpu';
import { flickerOn, shakeAt, stingBuffer } from '../../engine/scare';
import type { DreamContext, DreamModule } from '../types';
import { createFlashlight, FLASHLIGHT } from './flashlight';
import { buildRiverbank, riverbankColliders, SKY_NAME, SPAWN } from './riverbank';
import { loadWatcherFigure, shouldStrike, WATCHER, type WatcherState } from './watcher';

/** How hard the camera rolls during a scare jolt, in radians. Tuning knob. */
const JOLT_ROLL = 0.06;

/** Plan 1 test dream: walking, collisions, darkness, the flashlight and one scare. Plan 2 replaces it. */
export function createDream(): DreamModule {
  let flashlight: THREE.SpotLight | null = null;
  let stop: (() => void) | null = null;
  let camera: THREE.Camera | null = null;
  return {
    async start(ctx: DreamContext) {
      const scene = await buildRiverbank();
      const view = ctx.stage.camera;
      camera = view;
      scene.add(view);
      ctx.stage.scene = scene;
      const sky = scene.getObjectByName(SKY_NAME);
      ctx.player.colliders = riverbankColliders();
      ctx.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
      const light = createFlashlight(view);
      flashlight = light;
      const figure = await loadWatcherFigure();
      figure.position.set(WATCHER.x, 0, WATCHER.z);
      scene.add(figure);
      const sting = stingBuffer(ctx.audio.listener.context);
      let toldAboutLight = false;
      let watcher: WatcherState = 'waiting';
      let since = 0;
      stop = ctx.stage.addUpdater((dt) => {
        // Keep the sky centred on the player so it never ends, wherever they walk.
        sky?.position.set(view.position.x, 0, view.position.z);
        // Drop key taps made while reading or paused, so they don't fire on resume.
        if (ctx.isPaused()) {
          ctx.keys.consumePress('KeyF');
          return;
        }
        if (ctx.keys.consumePress('KeyF')) light.visible = !light.visible;
        if (!toldAboutLight && view.position.z < -8) {
          toldAboutLight = true;
          ctx.read(['It is getting dark. Press F to turn your flashlight on or off.']);
        }
        const distance = Math.hypot(view.position.x - WATCHER.x, view.position.z - WATCHER.z);
        if (shouldStrike(watcher, distance)) {
          watcher = 'struck';
          ctx.audio.once(sting, 0.9);
        }
        if (watcher !== 'struck') return;
        since += dt;
        figure.visible = since < WATCHER.vanishAfter;
        view.rotation.z = shakeAt(since) * JOLT_ROLL * Math.sin(since * 70);
        light.intensity = flickerOn(since) ? FLASHLIGHT.intensity : 0;
      });
    },
    dispose() {
      stop?.();
      if (flashlight && camera) camera.remove(flashlight, flashlight.target);
      camera?.rotation.set(0, camera.rotation.y, 0);
      camera?.removeFromParent();
    },
  };
}
```

`src/home/home.ts`:
```ts
import type * as THREE from 'three/webgpu';
import type { App } from '../app';
import { DREAMS } from '../dreams/registry';
import type { DreamInfo } from '../dreams/types';
import { enterFullscreen, toggleFullscreen } from '../engine/fullscreen';
import { button, el } from '../engine/ui';
import { buildBedroom } from './bedroom';
import { breathBuffer } from './breath';
import { addDreamCloud, tweenCamera } from './cloud';
import { nextHomeState, type HomeEvent, type HomeState } from './flow';
import { createZzz } from './zzzSprites';

export interface HomeHandle {
  dispose(): void;
}

/** Starts a dream; resolves to an error message, or null once the dream is running. */
export type Play = (info: DreamInfo) => Promise<string | null>;

export async function startHome(app: App, play: Play): Promise<HomeHandle> {
  const { stage, overlay, audio } = app;
  const room = await buildBedroom();
  stage.scene = room.scene;
  stage.camera.position.copy(room.view.position);
  stage.camera.lookAt(room.view.target);
  const zzz = createZzz(room.scene, room.head);
  const stopZzz = stage.addUpdater((dt) => zzz.update(dt));
  let state: HomeState = 'sleeping';
  let tone: THREE.Audio | null = null;
  const send = (event: HomeEvent): boolean => {
    const next = nextHomeState(state, event);
    if (next === state) return false;
    state = next;
    return true;
  };

  const showCards = (message?: string): void => {
    overlay.panel((panel) => {
      panel.append(el('h1', '', 'Choose a dream'));
      if (message) panel.append(el('p', 'error', message));
      for (const info of DREAMS) {
        const card = button('', () => send('pick') && showWarning(info), 'card');
        card.append(
          el('strong', '', info.title),
          el('span', '', `${info.minutes} min · ${info.warnings.join(' · ')}`),
        );
        panel.append(card);
      }
      panel.append(button('Full screen on/off', toggleFullscreen, 'btn quiet'));
    });
  };

  const showWarning = (info: DreamInfo): void => {
    overlay.panel((panel) => {
      panel.append(
        el('h1', '', info.title),
        el('p', 'big', `This dream contains: ${info.warnings.join(', ')}.`),
        el('p', '', 'Headphones recommended. Play somewhere quiet.'),
        button('Enter the dream', () => void enter(info), 'btn primary'),
        button('Back', () => send('back') && showCards(), 'btn quiet'),
      );
    });
  };

  const enter = async (info: DreamInfo): Promise<void> => {
    if (!send('confirm')) return;
    overlay.closePanel();
    await overlay.fade(true);
    const error = await play(info);
    if (error === null) return void send('loaded');
    send('load-failed');
    await overlay.fade(false);
    showCards(error);
  };

  const rise = async (): Promise<void> => {
    if (!send('start')) return;
    overlay.closePanel();
    enterFullscreen();
    audio.unlock().catch(() => undefined);
    // Just the sleeper's slow breathing: the home screen should feel quiet.
    tone = audio.loop(breathBuffer(audio.listener.context), 0.12);
    const center = room.head.clone().setY(6);
    addDreamCloud(room.scene, center);
    const to = {
      position: room.head
        .clone()
        .setY(3.2)
        .setZ(room.head.z + 0.6),
      target: center,
    };
    await tweenCamera(stage, room.view, to, 3.5);
    send('risen');
    showCards();
  };

  overlay.panel((panel) => {
    panel.classList.add('low');
    panel.append(
      el('h1', 'title', "Kartik's Dreams"),
      el('p', 'big', 'Every dream here really happened.'),
      button('Start', () => void rise(), 'btn primary'),
    );
  });

  return {
    dispose() {
      stopZzz();
      zzz.dispose();
      tone?.stop();
    },
  };
}
```

- [ ] **Step 7: Run the full check**

Run: `pnpm run format && pnpm run check`
Expected: all green, `Tests 83 passed`.

- [ ] **Step 8: [controller] Browser check**

On `http://localhost:5173/?nolock`:
1. The home screen is quiet except for soft, slow breathing after Start (Kartik checks by ear; the controller checks there are no console errors).
2. Enter the dream, then run `kd.stage.camera.position.set(2.5, 1.6, -6); kd.stage.camera.rotation.set(-0.3, -1.0, 0, 'YXZ')`. Two screenshots 2 s apart show the water's ripple pattern has moved.
3. Run `kd.stage.camera.position.set(0.6, 1.6, -26); kd.stage.camera.rotation.set(0.12, 0, 0, 'YXZ')`. The watcher stands in the fog on the path.
4. Move to `z = -33`. The figure's `visible` becomes false, `camera.rotation.z` is non-zero during the jolt and returns to 0, and there are no console errors.
5. Repeat 2–4 on `?nolock&webgl`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: quiet breathing home, flowing river, scare kit and the watcher" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Release check and hand-off

**Files:**
- No new code unless a check fails.

- [ ] **Step 1: 🔎 Grounded freshness check**

```bash
pnpm outdated
pnpm run audit
```
Expected: no high or critical advisories. For each outdated package, use the `grounded-research` skill before upgrading (read the changelog and confirm the new version works with the rest). Upgrade only if `pnpm run check` stays green, and never to a prerelease.

- [ ] **Step 2: Clean install and full check**

```bash
rm -rf node_modules dist
pnpm install --frozen-lockfile
pnpm run check
```
Expected: all green, 83 tests.

- [ ] **Step 3: Production preview smoke test [controller]**

Run `pnpm run build && pnpm run preview --port 4173`, then open `http://localhost:4173/` in Chrome.
Expected: home screen renders with no console errors, and `window.kd` is `undefined`. Measure frame rate in the riverbank by counting `requestAnimationFrame` calls over 3 s on WebGPU and `?webgl`. Expected: at least 55 fps on this Mac. If it is lower, lower `RENDER_HEIGHT` or the shadow map sizes before shipping.

- [ ] **Step 4: [Kartik] Manual checks in a real window**

Chrome, then Safari (macOS 26), on `pnpm run preview`:
1. Start goes fullscreen, the room tone is audible, and Z's rise.
2. Pick the dream. Read the intro with Enter, ← and Skip. After Continue, the mouse locks (cursor gone) and mouse look works.
3. Walk with WASD, run with Shift, toggle F.
4. Esc opens the pause menu. Change Mouse sensitivity and Volume. Reload the page; both settings are kept.
5. Click Resume immediately after Esc (Chrome may refuse). The pause menu must stay, and a second click works.
6. "Full screen on/off" toggles. "Quit to dreams" returns to the bedroom.

- [ ] **Step 5: Deploy notes**

Vercel detects Vite: build `vite build`, output `dist`, no config file needed. Kartik connects the repo in the Vercel dashboard when ready. No secrets are involved.

- [ ] **Step 6: Commit any fixes, then finish the branch**

Use `superpowers:finishing-a-development-branch`.

---

## What Plan 2 will cover (not in this plan)

- Asset pipeline: Quaternius animated zombies and fish pack (FBX → GLB via Blender), Kenney city kits. 🔎 per pack.
- Follow the River: intro at home (TV news, Mom, the fish thrown in), Day 1 city scavenging, Night 1 run downstream, flashlight stun and battery, bow, zombies, fish strikes fed by fish packs, checkpoints, HUD, first-time hint pages, "To be continued".
