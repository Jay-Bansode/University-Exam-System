import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Runs before any test module is imported, so the environment is already valid by
    // the time `config/env.ts` parses it at import time.
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    // Starting an in-memory MongoDB replica set takes a while on the first run, when the
    // mongod binary is downloaded and cached.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
