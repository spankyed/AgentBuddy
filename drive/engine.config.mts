import { defineConfig } from '@playwright/test';

// The repo's own serving config, the same shape `abuddy drive --serve` writes into a pack: only the
// engine's session, named exactly, so no .ts driving script is dragged into a serving run.
export default defineConfig({
  testDir: '.',
  testMatch: 'engine-session.mts',
  workers: 1,
  // A session ends when something asks it to, not when a clock says so
  timeout: 0,
  reporter: 'list',
  outputDir: 'results',
});
