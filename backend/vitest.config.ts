import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    fileParallelism: false, // integration tests share one MongoDB test database
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
