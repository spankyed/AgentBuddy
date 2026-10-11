import { definePackE2EConfig } from '@apack/testing/playwright';

/**
 * The repo's own E2E suite. Every setting but the diagnostics below is `definePackE2EConfig`'s, so this
 * config and the one a pack is scaffolded with cannot drift apart.
 */
export default definePackE2EConfig({
  // Kept here rather than moved into the helper: this is what the repo wants of its own runs, and giving
  // every pack's suite screenshots and traces is a change to what they write, not a shared default
  use: {
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
});
