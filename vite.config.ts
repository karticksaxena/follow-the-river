import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // Agents edit worktrees inside the repo; that must not reload the game being played.
    watch: { ignored: ['**/.claude/**', '**/.superpowers/**'] },
  },
  build: {
    // three.js alone is ~850 kB minified; each dream is already split out with import().
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    // Worktrees and SDD scratch copies live inside the repo; never run their tests.
    exclude: [...configDefaults.exclude, '.claude/**', '.superpowers/**'],
  },
});
