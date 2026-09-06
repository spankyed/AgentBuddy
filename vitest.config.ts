import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/abuddy-sdk',
      'packages/api',
      'packages/default-setup',
      {
        test: {
          name: '@app/default-setup-unit',
          root: 'packages/default-setup',
          include: ['src/**/*.test.ts'],
        },
      },
      'packages/renderer',
    ],
  },
});
