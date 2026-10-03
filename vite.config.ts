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
