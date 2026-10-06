import { configDefaults, defineConfig } from 'vitest/config';

/** This checkout's folder (with a trailing slash). */
const root = decodeURIComponent(new URL('.', import.meta.url).pathname);

export default defineConfig(({ command }) => ({
  // Production lives under kartiksaxena.com/dreams/play/ (multi-zone); dev stays at /.
  base: command === 'build' ? '/dreams/play/' : '/',
  server: {
    // Agents edit worktrees inside this repo; that must not reload the game being played. Only
    // this checkout's own folders: a worktree's server still watches its own files.
    watch: { ignored: [`${root}.claude/**`, `${root}.superpowers/**`] },
  },
  build: {
    outDir: command === 'build' ? 'dist/dreams/play' : 'dist',
    // three.js alone is ~850 kB minified; each dream is already split out with import().
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    // Worktrees and SDD scratch copies live inside the repo; never run their tests.
    exclude: [...configDefaults.exclude, '.claude/**', '.superpowers/**'],
  },
}));
