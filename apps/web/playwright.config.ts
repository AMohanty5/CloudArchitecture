import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config (blueprint doc 06 — the golden journey). Runs against an
 * already-running stack (web + core + Postgres/Redis): start it locally with
 * `pnpm dev`/the EC2 deploy, or point at the tunnel. Override the target with
 * `CAC_E2E_BASE_URL`. Browsers: `pnpm --filter @cac/web exec playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.CAC_E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
