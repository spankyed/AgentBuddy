import { defineConfig } from 'vitest/config';
import { defaultServerConditions } from 'vite';

// Vitest's own defaults: Vite's server conditions without 'module'
const conditions = ['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export default defineConfig({
  // Every project here is a host package, as in `vitest.config.ts`: the expensive halves all resolve the
  // workspace @abuddy packages to source. No pack suite has a second config, so the split that forces two
  // unit pools does not arise here.
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    /**
     * The expensive halves as one vitest run, so they share one job pool and one worker budget.
     *
     * They were three `npm -w` invocations in series: three startups, three pools, three `pretest` guards,
     * none overlapping. Measured 2026-09-29 — 31s, 32s and 8s standalone, 71s together, and 90-105s as the
     * chain step. Nothing kept them apart: all three declare the same resolution, so unlike the unit suites
     * there is no condition boundary between them, and vitest's sequencer takes every project's files as one
     * longest-first list across package boundaries.
     *
     * Each project loads its own config, which is where its `testTimeout` lives — per-project *test* config
     * is honoured, unlike `poolOptions` below.
     *
     * Written out rather than derived from `INTEGRATION_SUITES`, for the reason `vitest.config.ts` gives:
     * `check:specifiers` reads this file as text and cannot read a computed list. `chain-inputs.spec.ts`
     * asserts it is exactly the suites with a second config, so it cannot drift.
     */
    projects: [
      'packages/abuddy-cli/vitest.integration.config.ts',
      'packages/repo-checks/vitest.integration.config.ts',
      'packages/publish-checks/vitest.integration.config.ts',
    ],
    /**
     * Half the cores, because three of these 23 specs spawn a compiler.
     *
     * `poolOptions` is process-wide, so this cannot live in the project configs — it is set once here rather
     * than three times where two of the three copies would do nothing. Two of them carried it before this
     * file existed.
     *
     * The reason is a flake, not a slowdown: a worker per core oversubscribes the box, the main thread can
     * miss birpc's 60s window to answer a worker's `onTaskUpdate`, and the run fails with
     * "[vitest-worker]: Timeout calling" though every test passed. That window is not configurable — vitest
     * hardcodes `DEFAULT_TIMEOUT = 6e4` and passes no timeout at any of its `createBirpc` call sites.
     *
     * **It is a proxy, and a poor one**: what needs bounding is concurrent compilers, and what is bounded is
     * test workers, so twenty specs that spawn nothing pay for three that do. `add-extensions`,
     * `component-contracts` and `published-exports` are the three. Two of their spawns are `tsc --noEmit`,
     * which `typecheckPack` already does in-process; the plan for removing those and then testing whether
     * this is needed at all is `docs/goals/goal-integration-pool.md`, Phase 3.
     *
     * A percentage, because vitest reads this as `poolOptions.maxThreads ?? maxWorkers ?? (cpus - 1)`: it
     * replaces the default rather than capping it, so a fixed number raises the worker count on any machine
     * smaller than that number. `50%` is at most `cpus - 1` for cpus >= 2, so it can only lower.
     */
    poolOptions: { threads: { maxThreads: '50%' }, forks: { maxForks: '50%' } },
  },
});
