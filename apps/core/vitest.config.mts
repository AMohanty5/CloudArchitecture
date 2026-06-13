import { defineConfig } from 'vitest/config';
import { vitestBase } from '@cac/config/vitest.base.mjs';

// Unit tests only. Integration tests (testcontainers, Docker-dependent) live in
// test/integration and run via `pnpm test:int` with vitest.integration.config.mts.
export default defineConfig({
  test: { ...vitestBase.test, include: ['src/**/*.test.ts'] },
});
