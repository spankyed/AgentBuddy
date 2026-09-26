import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];
import { config as dotenvConfig } from 'dotenv';

// Load environment variables from .env file
dotenvConfig();

export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');
  return {
  /* Vite‑level plugins -------------------------------------------------- */
  // Workspace @abuddy/* packages resolve to source (see their package.json exports)
  ssr: { resolve: { conditions } },
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.test.json'] }),
  ],

  /* Vitest‑specific options -------------------------------------------- */
  test: {
    globals: true,                   // use `describe/it/expect` without imports
    environment: 'node',             // happy in pure Node (no jsdom needed here)
    // `unit/` is in-process and costs 4-22ms a file; `runtime/` boots the composed app over a temp data dir
    // and costs 100-1120ms. Both are this one suite and tier 1 (the in-memory runtime is what tier 1 admits,
    // and `SUITE_READS` records that it reads the built-in pack's dist) — the split is so that the cheap five
    // can be run on their own, which one directory called `unit` holding ten booting specs made impossible.
    include: ['tests/unit/**/*.spec.ts', 'tests/runtime/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    // Integration tests spawn real subprocesses and gate themselves on env
    // vars (RUN_INTEGRATION=1) so default `npm test` runs skip them cleanly.
    // Tier 1 (`TIER_TIMEOUT_MS`, scripts/lib/chain-steps.ts): a unit test that takes longer is hung,
    // not slow. This suite's slowest test is 0.7s.
    testTimeout: 15_000,
    // A hook gets the tier's budget too. Without this it falls back to vitest's 10s default, which is
    // tighter than the tier allows — a hook would fail at 10s for a policy that says 15s.
    hookTimeout: 15_000,
    // ❶  there is **no** `tsconfig` option – remove it
  },

  resolve: {
    conditions,
    alias: [
      { find: /^@\//, replacement: new URL('./src/', import.meta.url).pathname },
    ],
  },
  };
});