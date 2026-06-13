import { defineConfig } from 'vitest/config';

// Docker-dependent integration tests (testcontainers Postgres). Run on a host
// with a Docker daemon: `pnpm --filter @cac/core test:int`.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
