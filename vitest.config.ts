import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each project loads its own config, which is where its environment, setup files and the
    // @abuddy/source resolve conditions live
    projects: [
      'packages/abuddy-sdk',
      'packages/api',
      'packages/default-setup',
      'packages/renderer',
    ],
  },
});
