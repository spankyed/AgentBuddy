import { configDefaults, defineConfig } from 'vitest/config';
import { isolatedDataDir } from '@abuddy/testing/vitest';
// The harness requires an explicit environment and data dir (the media store). Each run gets a
// throwaway data dir, split per worker and removed when the run ends.
const dataDir = isolatedDataDir('default-setup-tests-');

export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths');
  return {
    // No resolve.conditions: default-setup is a pack, so it resolves the @abuddy packages' built dist
    // like every other pack. npm run typecheck:pack and test:external-pack refresh that dist first.
    plugins: [
      tsconfigPaths({ projects: ['./tsconfig.json'] }),
    ],

    test: {
      globals: true,
      environment: 'node',
      // Specs live in tests/, mirroring the source they cover (`CLAUDE.md`, Tests), so one pattern covers
      // every one of them. There used to be six under src/ as well, with an include for them whose comment
      // said "without this they are silently never run" — a layout that needs a config line to avoid
      // silence is one where the next file is silent.
      include: ['tests/**/*.spec.ts'],
      // `tests/_support/fixtures/` holds pack sources, not specs, and nothing in it ends in .spec.ts today.
      // Named anyway: a fixture pack that grows one would otherwise be collected into this suite.
      exclude: [...configDefaults.exclude, 'tests/_support/**'],
      // Tier 1 (`TIER_TIMEOUT_MS`, scripts/lib/chain-steps.ts): a unit test that takes longer is hung,
      // not slow. This suite's slowest test is 2.9s.
      testTimeout: 15_000,
      // A hook gets the tier's budget too; vitest's default is 10s, tighter than the tier allows
      hookTimeout: 15_000,
      // Test files run in parallel: each worker's tests create their own EARS engines
      fileParallelism: true,
      env: dataDir.env,
      globalSetup: dataDir.globalSetup,
      setupFiles: [...dataDir.setupFiles, './tests/setup.ts'],
    },
  };
});
