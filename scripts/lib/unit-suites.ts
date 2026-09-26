/**
 * The workspaces `test:unit` covers, and where each lives.
 *
 * One definition, because everything that runs or schedules them reads it — `scripts/test-unit.ts`, the
 * chain's steps, the pool's per-project cache, the spec-cost records — and a second list would drift the
 * first time a package was added.
 *
 * **The order is not an execution order.** Vitest's sequencer decides what runs when, across every project
 * at once; the root `vitest.config.ts` is where that is written down. So this is not sorted by cost, and a
 * reader should not infer that it is — it once claimed to be, and was wrong in a way nothing could notice.
 * What the order does have to do is match the `projects` list in that config, which `chain-inputs.spec.ts`
 * asserts.
 *
 * If an order is ever wanted, sort at the point of use from `etc/spec-cost.json`, already the authority on
 * what a suite costs, rather than re-sorting this literal. A guard on sortedness is the thing not to add:
 * the largest fast halves sit within a few percent of each other in those records, so it would fail on
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
   * `host` suites resolve the workspace `@abuddy` packages to source, under the `@abuddy/source`
   * condition. `pack` suites must resolve the published `dist` — the one layout a pack author ever has —
   * which is why `check:specifiers` fails a pack config that declares that condition.
   *
   * **Node conditions are per process**, and vitest shares its worker pool across projects: per-project
   * `poolOptions.execArgv` is ignored, measured. So the two kinds cannot be one pool. Probed 2026-09-25,
   * a `default-setup` spec resolves `@abuddy/sdk` to `dist` today and to `src` inside a pooled process
   * carrying the condition, which would silently change what the pack suite verifies.
   */
  readonly kind: 'host' | 'pack';
}

export const UNIT_SUITES: readonly UnitSuite[] = [
  { workspace: '@abuddy/sdk', dir: 'abuddy-sdk', kind: 'host' },
  { workspace: '@app/default-setup', dir: 'default-setup', kind: 'pack' },
  { workspace: '@abuddy/cli', dir: 'abuddy-cli', kind: 'host' },
  { workspace: '@abuddy/host', dir: 'abuddy-host', kind: 'host' },
  { workspace: '@app/api', dir: 'api', kind: 'host' },
  { workspace: '@app/repo-checks', dir: 'repo-checks', kind: 'host' },
  { workspace: '@abuddy/ears', dir: 'abuddy-ears', kind: 'host' },
  { workspace: '@app/renderer', dir: 'renderer', kind: 'host' },
  { workspace: '@app/main', dir: 'main', kind: 'host' },
  { workspace: '@abuddy/testing', dir: 'abuddy-testing', kind: 'host' },
  { workspace: '@abuddy/ui', dir: 'abuddy-ui', kind: 'host' },
];

/**
 * The chain step that runs a suite: one per pool rather than one per suite. That is `POOL_STEPS`' decision
 * and its doc in `scripts/lib/chain-steps.ts` carries the reasoning, including what the per-suite steps were
 * buying and where it went instead.
 */
export const unitStepName = (suite: UnitSuite): string => `test:unit:${suite.kind}`;
