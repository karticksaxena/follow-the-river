import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
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
