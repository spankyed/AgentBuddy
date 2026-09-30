import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Tier 2 (`TIER_TIMEOUT_MS`): each of these npm-packs three packages into a temp consumer and compiles
    // it across the TypeScript matrix, which is tens of seconds of work in a handful of tests.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.integration.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
