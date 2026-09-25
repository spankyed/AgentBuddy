import { defineConfig } from 'vitest/config';
import { UNIT_SUITES } from './scripts/lib/unit-suites.ts';

export default defineConfig({
  test: {
    /**
     * The host unit suites as one vitest run, so they share one job pool and one worker budget.
     *
     * Two schedulers with no shared budget was the ceiling: `scripts/test-unit.ts` scheduled suites while
     * vitest scheduled files inside each one, so a third lane oversubscribed within a suite rather than
     * filling idle cores. Vitest's default sequencer takes every project's files as one list and sorts it
     * longest-first, which is the greedy makespan approximation across package boundaries.
     *
     * Derived from `UNIT_SUITES`, which `scripts/test-unit.ts` and the chain's step table already share, so
     * this cannot drift from what the chain runs. Each project loads its own config, which is where its
     * environment, setup files and resolve conditions live — nothing is flattened here.
     *
     * **The pack suite is not here, and cannot be.** `@app/default-setup` must resolve the published
     * `dist` while these resolve source, and Node conditions are per process: vitest shares its worker
     * pool across projects and ignores per-project `poolOptions.execArgv`, measured. A pooled process
     * carrying the condition makes a `default-setup` spec resolve `@abuddy/sdk` to `src` where it resolves
     * `dist` today, which silently changes what that suite verifies. So there are two pools, split on the
     * boundary `check:specifiers` already enforces, rather than one that quietly breaks it.
     */
    projects: UNIT_SUITES.filter((suite) => suite.kind === 'host').map((suite) => `packages/${suite.dir}`),
  },
});
