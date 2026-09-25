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
}

export const UNIT_SUITES: readonly UnitSuite[] = [
  { workspace: '@abuddy/sdk', dir: 'abuddy-sdk' },
  { workspace: '@app/default-setup', dir: 'default-setup' },
  { workspace: '@abuddy/cli', dir: 'abuddy-cli' },
  { workspace: '@abuddy/host', dir: 'abuddy-host' },
  { workspace: '@app/api', dir: 'api' },
  { workspace: '@abuddy/ears', dir: 'abuddy-ears' },
  { workspace: '@app/renderer', dir: 'renderer' },
  { workspace: '@app/main', dir: 'main' },
];

/** The chain step that runs one suite: `test:unit:<dir>`, which the root package.json declares */
export const unitStepName = (suite: UnitSuite): string => `test:unit:${suite.dir}`;
