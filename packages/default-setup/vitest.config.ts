import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @app/default-setup.
 *
 * Tests cover both feature-local helpers (pure, no deps) and feature
 * systems/repositories that depend on api core (EARS, repository proxy).
 * Path aliases bridge the two packages so imports like `@/features/*`
 * and `@/core/*` resolve correctly.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
    ],
    testTimeout: 120_000,
    setupFiles: ['./tests/setup.ts'],
  },

  resolve: {
    alias: [
      { find: '@/features', replacement: new URL('./src/features', import.meta.url).pathname },
      { find: '@/registries', replacement: new URL('./src/registries', import.meta.url).pathname },
      { find: '@/shared-services', replacement: new URL('./src/shared/services', import.meta.url).pathname },
      { find: /^@abuddy\/sdk\/(.+)$/, replacement: new URL('../abuddy-sdk/src/$1/index.ts', import.meta.url).pathname },
      { find: '@abuddy/sdk', replacement: new URL('../abuddy-sdk/src/index.ts', import.meta.url).pathname },
      { find: /^@\//, replacement: new URL('../api/src/', import.meta.url).pathname },
    ],
  },
});
