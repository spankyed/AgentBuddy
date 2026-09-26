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
    // Specs live where the source they cover does (`CLAUDE.md`, Tests), so one pattern covers every one of
    // them. `runtime/` boots the composed app over a temp data dir and costs 100-1120ms a file, the rest are
    // in-process at 4-22ms; all of it is this one suite and tier 1 (the in-memory runtime is what tier 1
    // admits, and `SUITE_READS` records that it reads the built-in pack's dist). Running the cheap ones alone
    // is `npm run spec -- <name>`, not a directory: a directory that named the cost half was the second
    // mechanism for a fact the .integration.spec.ts suffix already carries.
    include: ['tests/**/*.spec.ts'],
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