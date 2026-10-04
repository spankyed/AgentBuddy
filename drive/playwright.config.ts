import { defineConfig } from '@playwright/test';

/**
 * Driving, not testing. Playwright is only the thing that can hold a page open and talk to Electron:
 * nothing here asserts, nothing gates on it, and `npm test` never sees this directory — it is outside
 * `tests/e2e`, which is what `testDir` there means, rather than excluded from it.
 */
export default defineConfig({
  testDir: '.',
  // Any .ts file: a driving script should not have to be named like a spec
  testMatch: '**/*.ts',
  testIgnore: 'playwright.config.ts',
  // One app at a time; two scripts would fight over the same data dir
  workers: 1,
  // No timeout: you are looking at it
  timeout: 0,
  reporter: 'list',
  // Beside the scripts, for the reason `91b348069` moved the screenshots here: driving output is not test
  // output. Without it Playwright writes `test-results/` at the repo root, which `drive/.gitignore` cannot
  // reach and two chain steps declare as their own
  outputDir: 'results',
});
