import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  outputDir: 'tests/results',
  use: {
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  workers: 1,
});
