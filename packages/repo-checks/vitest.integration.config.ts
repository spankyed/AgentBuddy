import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Tier 2 (`TIER_TIMEOUT_MS`): these specs run `tsc` over fixture trees, which is tens of seconds of
    // work in a handful of tests.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.integration.spec.ts'],
    exclude: ['**/node_modules/**'],
    // No worker cap here, unlike @abuddy/cli's integration half. That cap exists because a worker per core
    // spawning its own compiler oversubscribes the box; this half is two files, so the pool is two workers
    // on any machine. Add one here when it stops being two.
  },
});
