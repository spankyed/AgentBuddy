// The one claim behind reading a reporter instead of vitest's console output: that the number it hands
// back is the number the console prints. It is a claim about *vitest*, not about this repo, so it is the
// one thing here that has to be re-established rather than reasoned about.
//
// `vitest/reporters` exports `Reporter` and nothing else, and the declaration it comes from says "The
// public Vitest API is experimental and does not follow semver". Four of its fields are read:
// `project.name`, `project.config.root`, `module.diagnostic().duration` and `module.state()`. A *removal*
// is already a compile error — the hook names are pinned with `satisfies keyof Reporter` and the parameter
// types derived from it — so what is left unguarded is a field that still exists and comes to mean
// something else. `diagnostic().duration` and the `task.result.duration` the default reporter rounds are
// two different accessors; they agree today, and nothing but this says so.
//
// **The integration half, because it spawns four vitests and can only fail on a vitest upgrade.** It was
// in the fast half for a day, which is the per-change loop: ~2.2s on ~19s for a check no code change can
// move. The half is also where `subprocess-inventory.spec.ts` counts spawning files — its population is
// the pooled integration run — so in the fast half this was a spawning file nothing inventoried, which is
// the second reason. `spec-plan-collect.spec.ts` stays fast and spawns one: "Alone it is a second, which
// is a fast spec that happens to spawn." Four is not one.
//
// **So the repo holds two readers of the console format, not one**: `slow-tests.ts`, which needs it because
// it reads any chain step's output, and this. Worth stating plainly because the commit that ported
// `measure-suites.ts` claimed one remained, and this arrived two commits later. The difference is the
// direction each fails in — production code wrong about the format goes quiet, which is why that copy
// went; a spec wrong about it fails, and failing is the job.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { boundedSpawn } from '../../../scripts/lib/bounded-spawn.ts';
import { readReportedRun, SPEC_DURATIONS_FILE } from '../../../scripts/lib/spec-durations-reporter.ts';
import { TIMEOUT_MS } from '../../../scripts/lib/step-timeouts.ts';
import { UNIT_SUITES, type UnitSuite } from '../../../scripts/lib/unit-suites.ts';
import { CONFIG_BY_HALF, halfOfPath, specFiles, type Half } from '../../../scripts/lib/spec-halves.ts';
import { POOLS, type Pool } from '../../../scripts/lib/unit-pool.ts';

/**
 * The cheapest suite that has the half a shape runs, so each spawn is seconds rather than minutes.
 *
 * **Derived, which the comment here claimed before the code did it.** It named `abuddy-ui` and said a suite
 * that shrank past it would take over without an edit, which was simply false. The count comes from
 * `specFiles`, so it is a fact about the tree and needs no measurement and no threshold.
 *
 * `repo-checks` is excluded for the integration half: this spec *is* in that half, so running it would run
 * this file inside itself.
 */
const cheapest = (half: Half): UnitSuite => {
  const specs = (suite: UnitSuite): number =>
    specFiles(path.join(REPO_ROOT, 'packages', suite.dir)).filter((file) => halfOfPath(file) === half).length;
  const candidates = UNIT_SUITES
    .filter((suite) => suite.kind === 'host' && suite.dir !== 'repo-checks' && specs(suite) > 0);
  const found = [...candidates].sort((a, b) => specs(a) - specs(b))[0];
  expect(found, `no host suite has a ${half} half to run`).toBeDefined();
  return found!;
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-agrees-'));
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

// eslint-disable-next-line no-control-regex -- the console colours its output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;
/**
 * The default reporter's own per-file line, read here and **only** here.
 *
 * This is the pattern the production code stopped carrying, and it is in a spec on purpose: the point is
 * to compare the reporter against the console, which takes reading the console. A spec that is wrong about
 * the format fails; production code that is wrong about it goes quiet, which is why that copy went.
 */
const CONSOLE_LINE = /^\s*[✓×❯]\s+(?:(?:\|[^|]*\||\S+)\s+)?(\S+\.(?:spec|test)\.ts)\s+\([^)]*\)\s+(\d+)ms\b/;

interface Run {
  readonly printed: Map<string, number>;
  readonly reported: ReturnType<typeof readReportedRun>;
}

/**
 * Every shape a pool invokes vitest in, which is the population and not an example of it.
 *
 * `standalone` is a package's own config run directly, the **pack** pool's shape — and the one where
 * `TestProject.name` is empty, so the fallback has a subject. `rootConfig` is the root config with
 * `--project`, the **host** pool's, and where most of this repo's durations come from. `integrationConfig`
 * is the root *integration* config, the third pool's, and it runs a different half.
 *
 * The first version of this spec pinned the standalone shape alone and so guarded the minority of the
 * numbers. The second pinned two and called that all of them; the population case below is what said
 * otherwise, and finding a third shape on its first run is the reason it is there rather than a comment
 * asserting the set is complete.
 */
const SHAPES = {
  standalone: () => ({
    half: 'fast' as Half,
    command: 'npm',
    args: (workspace: string, reporter: string) =>
      ['test', '-w', workspace, '--', '--reporter=default', `--reporter=${reporter}`],
  }),
  rootConfig: () => ({
    half: 'fast' as Half,
    // with-source supplies the condition the host pool's projects resolve under
    command: 'node',
    args: (workspace: string, reporter: string) =>
      ['scripts/with-source.mjs', 'npx', 'vitest', 'run', '--project', workspace,
        '--reporter=default', `--reporter=${reporter}`],
  }),
  integrationConfig: () => ({
    half: 'integration' as Half,
    command: 'npx',
    args: (workspace: string, reporter: string) =>
      ['vitest', 'run', '--config', CONFIG_BY_HALF.integration, '--project', workspace,
        '--reporter=default', `--reporter=${reporter}`],
  }),
} as const;

type Shape = keyof typeof SHAPES;

/**
 * One run per shape, kept, because both cases ask about the same run.
 *
 * Not an optimisation of a cheap thing: the integration shape runs another package's expensive half and
 * costs ~9s, so spawning it per case doubled this file from 12s to 23s. The runs are read-only — two
 * questions about one answer — so there is nothing for sharing to confuse.
 */
const runs = new Map<Shape, Promise<Run & { workspace: string }>>();
const bothReporters = (shape: Shape): Promise<Run & { workspace: string }> => {
  if (!runs.has(shape)) runs.set(shape, runShape(shape));
  return runs.get(shape)!;
};

/** One real run of the cheapest suite with that shape's half, with both reporters on it */
async function runShape(shape: Shape): Promise<Run & { workspace: string }> {
  const out = path.join(temp, `${shape}.json`);
  const reporter = path.join(REPO_ROOT, 'scripts', 'lib', 'spec-durations-reporter.ts');
  const { half, command, args } = SHAPES[shape]();
  const workspace = cheapest(half).workspace;
  const { output } = await boundedSpawn(command, args(workspace, reporter), TIMEOUT_MS.suite.ms,
    // From the repo root either way: one shape resolves the root config, another a workspace by name
    { cwd: REPO_ROOT, env: { ...process.env, [SPEC_DURATIONS_FILE]: out } });
  const printed = new Map<string, number>();
  for (const line of output.replace(ANSI, '').split('\n')) {
    const match = CONSOLE_LINE.exec(line);
    if (match !== null) printed.set(match[1]!, Number(match[2]));
  }
  return { printed, reported: readReportedRun(out), workspace };
}

describe('the durations reporter agrees with the console it replaced', () => {
  it.each(Object.keys(SHAPES) as Shape[])('in a %s run, reports the files the console printed with the same milliseconds', async (shape) => {
    const { printed, reported } = await bothReporters(shape);
    expect(reported, `no file at ${temp} — the reporter did not run, so this case proves nothing`).toBeDefined();
    expect(printed.size, 'the console printed no per-file line, so there is nothing to compare against')
      .toBeGreaterThan(0);

    // Also what pins `module.state()`: if it stopped answering `passed`, every module would read as skipped
    // and this set would be empty — which matters because `durationsOf` drops skipped modules, so the pool
    // would record nothing and the marker gate would quietly check no marker at all
    const ran = reported!.modules.filter((module) => !module.skipped);
    expect(ran.map((module) => module.file).sort(), 'the two disagree about which files ran')
      .toEqual([...printed.keys()].sort());

    // **The claim.** `getDurationPrefix` rounds `task.result.duration`; this reads `diagnostic().duration`.
    // Equality after rounding is what says they are the same quantity rather than two near ones, and it is
    // what vitest's own `json` reporter fails — that one has no per-file duration at all, only a span
    // between a module's first and last test, measured 0.5-42ms low per file.
    const disagreed = ran
      .map((module) => ({ file: module.file, reported: module.ms, console: printed.get(module.file)! }))
      .filter((row) => Math.round(row.reported) !== row.console);
    expect(disagreed, 'the reporter and the console no longer name the same duration: vitest has changed what '
      + 'one of diagnostic().duration or task.result.duration means, and every @slow: marker was calibrated '
      + 'against the other').toEqual([]);
  });

  /**
   * And it reports a file's overhead, which the console does not print — so this claim is narrower on purpose.
   *
   * `ms` is pinned to the console's own figure because both read `task.result.duration`. Nothing displays
   * the four fields this sums, so there is no second account to agree with and the most that can be
   * asserted is that it arrives and is a real measurement. Said plainly rather than left to look like the
   * same kind of check as the one above.
   *
   * It is recorded at all because `ms` is tests and hooks only, and which part of the rest dominates
   * depends on the pool: collection for the host pool (68-85s against 71-92s of tests), setup for the pack
   * pool (`content-parity` at 1,703ms of setup against 753ms of tests). A `work/cores` computed from `ms`
   * alone understates by about two, which is how an 18.3s floor came to be read as binding against a
   * `work/cores` of 8.7s.
   */
  it.each(Object.keys(SHAPES) as Shape[])('reports a file\'s overhead beside its tests in a %s run', async (shape) => {
    const { reported } = await bothReporters(shape);
    const ran = reported!.modules.filter((module) => !module.skipped);
    expect(ran, 'no module ran, so there is nothing to have cost anything').not.toEqual([]);
    const missing = ran.filter((module) => !(module.overheadMs > 0));
    expect(missing.map((module) => module.file),
      'a module that ran was imported and prepared, so its overhead cannot be zero — one of '
      + 'collectDuration/setupDuration/environmentSetupDuration/prepareDuration has stopped answering')
      .toEqual([]);
  });

  /**
   * And it names the project in both shapes, which vitest itself does in only one.
   *
   * `TestProject.name` is "the name of the project or **an empty string if not set**", and no config here
   * sets `test.name`. Under the root config vitest fills it from each project's `package.json`; for a
   * standalone run of one package's own config — the pack pool's shape — it is empty. Observed before the
   * fallback existed: the pack pool refused its own run because `@app/default-setup` "never reported". The
   * fallback reads the same `package.json` vitest would, so the two shapes answer alike and there is one
   * notion of a project's identity rather than two that agree by accident.
   */
  it.each(Object.keys(SHAPES) as Shape[])('names the project in a %s run', async (shape) => {
    const { reported, workspace: expected } = await bothReporters(shape);
    expect(reported!.projects, 'the project is unnamed, so attribution would fail for every file in it')
      .toEqual([expected]);
    expect([...new Set(reported!.modules.map((module) => module.project))]).toEqual([expected]);
  });

  // The population, so neither case above can pass over a shape nobody runs
  it('covers every shape a pool invokes vitest in', () => {
    const invoked = (Object.keys(POOLS) as Pool[]).map((pool) =>
      POOLS[pool].run(POOLS[pool].suites())[0]!.command);
    expect(new Set(invoked), 'a pool invokes vitest some way these shapes do not cover')
      .toEqual(new Set(Object.keys(SHAPES).map((shape) => SHAPES[shape as Shape]().command)));
  });
});
