import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports). The specs here read
  // the *packed* copies instead, which they install themselves — the condition is for the tooling they
  // import, not for what they check.
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Tier 1 (`TIER_TIMEOUT_MS`, scripts/lib/chain-steps.ts), declared rather than left to vitest's 5s
    // default, which is tighter than the tier allows (`suite-timeouts.spec.ts`).
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts', '**/node_modules/**'],
  },
});
