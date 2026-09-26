import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Tier 1 (`TIER_TIMEOUT_MS`, scripts/lib/chain-steps.ts). Declared rather than left to vitest's 5s
    // default, which is *tighter* than the tier allows: under the chain's three lanes a 5.8s typecheck in
    // @abuddy/sdk crossed it and reported a hang where the tier had headroom to spare.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.spec.ts'],
  },
});
