/**
 * The workspaces `test:unit` covers, and where each lives.
 *
 * One definition, because two things need it and they must agree: `scripts/test-unit.ts` runs them, and
 * `scripts/lib/chain-steps.ts` gives each one a chain step so a change in one package re-runs one suite
 * rather than eight. A list in both places would drift the first time a package was added.
 *
 * Slowest first: the tail of a concurrent run is whatever started last.
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
  { workspace: '@abuddy/ears', dir: 'abuddy-ears', kind: 'host' },
  { workspace: '@app/renderer', dir: 'renderer', kind: 'host' },
  { workspace: '@app/main', dir: 'main', kind: 'host' },
];

/**
 * The chain step that runs a suite. Steps are per pool, not per suite: eight steps meant eight vitest
 * processes, which is the thing pooling removed. The per-package cache key survives inside the step.
 */
export const unitStepName = (suite: UnitSuite): string => `test:unit:${suite.kind}`;
