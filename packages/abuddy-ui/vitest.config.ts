import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Tier 1 (`TIER_TIMEOUT_MS`, scripts/lib/chain-steps.ts). A budget belongs to the tier, not to each
    // test that trips over vitest's 5s default.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // One half, because every spec here builds its own fixture in a temp directory and none reads the
    // built packages. A spec that grows past the band in `etc/spec-cost.json` needs a second config first;
    // `suite-split.spec.ts` says so by name rather than letting it sit in the wrong half.
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
