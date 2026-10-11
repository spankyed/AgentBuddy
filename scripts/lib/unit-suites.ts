/**
 * The workspaces `test:unit` covers, and where each lives.
 *
 * One definition, because everything that runs or schedules them reads it — `scripts/test-unit.ts`, the
 * chain's steps, the pool's per-project cache, the per-machine duration cache — and a second list would
 * drift the first time a package was added.
 *
 * **The order is not an execution order.** Vitest's sequencer decides what runs when, across every project
 * at once; the root `vitest.config.ts` is where that is written down. So this is not sorted by cost, and a
 * reader should not infer that it is — it once claimed to be, and was wrong in a way nothing could notice.
 * What the order does have to do is match the `projects` list in that config, which `chain-inputs.spec.ts`
 * asserts.
 *
 * If an order is ever wanted, sort at the point of use from what a run measured
 * (`spec-durations.ts`'s cache) rather than re-sorting this literal. A guard on sortedness is the thing
 * not to add: the largest fast halves sit within a few percent of each other, so it would fail on
 * measurement drift and never on a mistake.
 */
export interface UnitSuite {
  /** The npm workspace name, as `npm test -w` takes it */
  readonly workspace: string;
  /** Its directory under `packages/`, which is what an input path needs */
  readonly dir: string;
  /**
   * Which resolution a suite runs under, and therefore which pool it can share.
   *
   * `host` suites resolve the workspace `@apack` packages to source, under the `@apack/source`
   * condition. `pack` suites must resolve the published `dist` — the one layout a pack author ever has —
   * which is why `check:specifiers` fails a pack config that declares that condition.
   *
   * **Node conditions are per process**, and vitest shares its worker pool across projects: per-project
   * `poolOptions.execArgv` is ignored, measured. So the two kinds cannot be one pool. Probed 2026-09-25,
   * a `default-setup` spec resolves `@apack/sdk` to `dist` today and to `src` inside a pooled process
   * carrying the condition, which would silently change what the pack suite verifies.
   */
  readonly kind: 'host' | 'pack';
}

export const UNIT_SUITES: readonly UnitSuite[] = [
  { workspace: '@apack/sdk', dir: 'apack-sdk', kind: 'host' },
  { workspace: '@app/default-setup', dir: 'default-setup', kind: 'pack' },
  { workspace: '@apack/cli', dir: 'apack-cli', kind: 'host' },
  { workspace: '@apack/host', dir: 'apack-host', kind: 'host' },
  { workspace: '@app/api', dir: 'api', kind: 'host' },
  { workspace: '@app/repo-checks', dir: 'repo-checks', kind: 'host' },
  { workspace: '@apack/ears', dir: 'apack-ears', kind: 'host' },
  { workspace: '@app/renderer', dir: 'renderer', kind: 'host' },
  { workspace: '@app/main', dir: 'main', kind: 'host' },
  { workspace: '@app/preload', dir: 'preload', kind: 'host' },
  { workspace: '@apack/testing', dir: 'apack-testing', kind: 'host' },
  { workspace: '@apack/ui', dir: 'apack-ui', kind: 'host' },
  { workspace: '@app/publish-checks', dir: 'publish-checks', kind: 'host' },
];

/**
 * The chain step that runs a suite: one per pool rather than one per suite. That is `POOL_STEPS`' decision
 * and its doc in `scripts/lib/chain-steps.ts` carries the reasoning, including what the per-suite steps were
 * buying and where it went instead.
 */
export const unitStepName = (suite: UnitSuite): string => `test:unit:${suite.kind}`;

/**
 * What one test may take, by the size of the target that runs it — Bazel's `size`, which is a bucket
 * whose whole purpose is a default timeout.
 *
 * **Two buckets, because two is what has consumers.** Bazel has four; three of them here would be values
 * nothing distinguishes, which is the defect this replaced: `tier` had three values and two consumers,
 * each using it as a different binary.
 *
 * The point is the ceiling, not the number. `testTimeout: 120_000` on a unit suite turns a hang into a
 * slow pass — a load-induced stall reached a chain summary as two unexplained errors rather than as a
 * timeout. Measured 2026-09-25, the slowest single test in the two suites that set that value was 2.9s
 * (`@app/default-setup`) and 0.7s (`@app/api`), so `small` has five times the headroom it needs.
 *
 * A suite that sets nothing gets vitest's 5s default, which is *tighter* than `small` allows, so a config
 * that declares nothing is running on a third number nobody chose. This is a bound on what a config may
 * declare, checked by `suite-timeouts.spec.ts`, not a value the configs import: a vitest config importing
 * across package layers is the thing `check:specifiers` exists to prevent.
 */
export const SIZE_MS = { small: 15_000, large: 60_000 } as const;
export type Size = keyof typeof SIZE_MS;

/**
 * Which size a given test file runs at is `sizeOf` (`scripts/lib/test-timeouts.ts`), not a field here.
 *
 * It is derived rather than declared, because what it would declare is already decided elsewhere: a spec
 * lives in the fast half or the integration half, declared by its filename, and the halves *are* size
 * classes. A per-suite `size` field would be a constant — every fast half small,
 * every integration half large — and a list whose every entry is the same value is one nobody maintains.
 *
 * It lives there rather than here so this module stays a leaf: answering for a *spec* needs
 * `INTEGRATION_SUITES`, and importing that would point this file at `chain-steps.ts`, which imports it.
 */
