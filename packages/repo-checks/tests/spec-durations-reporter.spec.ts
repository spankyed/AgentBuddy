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
// It spawns a vitest, which `spec-plan-collect.spec.ts` is the precedent for: "Alone it is a second, which
// is a fast spec that happens to spawn." One small project, for the same reason.
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
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

/**
 * The smallest host suite, so the spawn is a second rather than a minute.
 *
 * Derived rather than named: `@abuddy/ui` is two files today and the point is only that it is small, so a
 * suite that shrinks past it should take over without an edit here. Its own `vitest.config.ts` is run
 * directly, which also makes this the *standalone* invocation — the one where vitest reports no project
 * name at all, so the fallback below has a subject.
 */
const SMALL = 'abuddy-ui';

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

/** One real run of one small suite, with both reporters on it */
async function bothReporters(): Promise<Run> {
  const out = path.join(temp, 'run.json');
  const reporter = path.join(REPO_ROOT, 'scripts', 'lib', 'spec-durations-reporter.ts');
  const { output } = await boundedSpawn('npm',
    ['test', '-w', UNIT_SUITES.find((suite) => suite.dir === SMALL)!.workspace, '--',
      '--reporter=default', `--reporter=${reporter}`],
    TIMEOUT_MS.suite.ms,
    { env: { ...process.env, [SPEC_DURATIONS_FILE]: out } });
  const printed = new Map<string, number>();
  for (const line of output.replace(ANSI, '').split('\n')) {
    const match = CONSOLE_LINE.exec(line);
    if (match !== null) printed.set(match[1]!, Number(match[2]));
  }
  return { printed, reported: readReportedRun(out) };
}

describe('the durations reporter agrees with the console it replaced', () => {
  it('reports every file the console printed, and the same milliseconds for each', async () => {
    const { printed, reported } = await bothReporters();
    expect(reported, `no file at ${temp} — the reporter did not run, so this case proves nothing`).toBeDefined();
    expect(printed.size, 'the console printed no per-file line, so there is nothing to compare against')
      .toBeGreaterThan(0);

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
   * And it names the project, which vitest does not for this invocation.
   *
   * `TestProject.name` is "the name of the project or **an empty string if not set**", and no config here
   * sets `test.name`: under the root config vitest fills it from each project's `package.json`, and for a
   * standalone run of one package's own config — which is how the pack pool invokes `npm test -w` — it is
   * empty. Observed before the fallback existed: the pack pool refused its own run because
   * `@app/default-setup` "never reported". The fallback reads the same `package.json` vitest would, so
   * there is one notion of a project's identity rather than two that agree under one invocation.
   */
  it('names the project even where vitest leaves it empty', async () => {
    const { reported } = await bothReporters();
    const expected = UNIT_SUITES.find((suite) => suite.dir === SMALL)!.workspace;
    expect(reported!.projects, 'a standalone run reports no project name, and the fallback is what supplies it')
      .toEqual([expected]);
    expect([...new Set(reported!.modules.map((module) => module.project))]).toEqual([expected]);
  });
});
