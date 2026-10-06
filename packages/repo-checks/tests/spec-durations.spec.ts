// What a pool run's own reporter recorded, which is no longer a parse: the shapes a console line could
// take are vitest's business and this reads a typed object instead. The gate over it is pinned in both
// directions, because the two are
// not symmetrical — a marked spec that reads fast fails the step, and an unmarked one that reads slow is
// only ever reported, since load can inflate a duration and cannot shorten one.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import {
  asDuration, asLocalTime, durationCacheDir, durationsOf, markedSpecs, placementOf, pruneDurationCache,
  cachedDurations, halfTotal, KEPT_RUNS, quantileOf, readDurationRuns, readDurations, slowestFiles,
  slowReason, tailBar,
  trendOf, writeDurations, type FileDuration,
} from '../../../scripts/lib/spec-durations.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';
import { CONFIG_BY_HALF, type Half } from '../../../scripts/lib/spec-halves.ts';
import type { ReportedRun } from '../../../scripts/lib/spec-durations-reporter.ts';

/** Two suites that really exist and really hold these files, since attribution is by path on disk */
const HOST = UNIT_SUITES.filter((suite) => ['abuddy-host', 'abuddy-sdk'].includes(suite.dir));
const ONE = UNIT_SUITES.filter((suite) => suite.dir === 'abuddy-host');

const row = (dir: string, file: string, ms: number): FileDuration =>
  ({ dir, file, ms, half: file.endsWith('.integration.spec.ts') ? 'integration' : 'fast' });

const temp: string[] = [];
const tmpdir = (): string => {
  const made = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-durations-'));
  temp.push(made);
  return made;
};
afterEach(() => {
  for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A module as the durations reporter records one */
const mod = (project: string, file: string, ms: number, skipped = false) => ({ project, file, ms, skipped });
const reported = (...modules: ReturnType<typeof mod>[]): ReportedRun =>
  ({ projects: [...new Set(modules.map((one) => one.project))], modules });

/**
 * Every file the run reported, attributed to the suite that holds it.
 *
 * **This replaced a parse of vitest's console output, and most of the cases went with it.** There were
 * five that existed only because of what a console line is: a bare line and a piped `|name|` label and a
 * coloured one (three spellings of the same fact), a path-vs-label preference for the one relative path
 * two suites share, a `(ms|s)` unit arm no vitest 3.2.4 line can produce, and a pair holding the refusal
 * that told "the format moved" apart from "nothing ran". The reporter states the project and the
 * duration, so none of those is a question any more — and the refusal is now the caller's, over a file
 * that never arrived, which is a stronger thing to check than a format that looks wrong.
 */
describe('durationsOf', () => {
  it('attributes a module to the suite whose project reported it', () => {
    const run = reported(
      mod('@abuddy/host', 'tests/database/write-lock.spec.ts', 4890),
      mod('@abuddy/sdk', 'tests/build/generate-entries.spec.ts', 17745),
    );
    expect(durationsOf(run, HOST)).toEqual([
      row('abuddy-host', 'tests/database/write-lock.spec.ts', 4890),
      row('abuddy-sdk', 'tests/build/generate-entries.spec.ts', 17745),
    ]);
  });

  /**
   * The path that two suites share, which a parse could only resolve from a label.
   *
   * `tests/source-layout.spec.ts` is in both `api` and `renderer`, and the old reading fell back to
   * looking for the file on disk whenever vitest had printed no label — which it does for any
   * single-project run. The project is stated now, so the collision cannot arise.
   */
  it('keeps two suites\' identically-named specs apart', () => {
    const covered = UNIT_SUITES.filter((suite) => ['api', 'renderer'].includes(suite.dir));
    const run = reported(
      mod('@app/renderer', 'tests/source-layout.spec.ts', 55),
      mod('@app/api', 'tests/source-layout.spec.ts', 31),
    );
    expect(durationsOf(run, covered)).toEqual([
      row('renderer', 'tests/source-layout.spec.ts', 55),
      row('api', 'tests/source-layout.spec.ts', 31),
    ]);
  });

  /**
   * A skipped module is dropped, and that is a correctness fix rather than a port.
   *
   * The console prints a skipped file with no duration at all, so the parse excluded it by accident — the
   * pattern required a time. A reporter gives it `0`, and counting a file that never executed as a 0ms
   * reading would pull its half's quantile bar down. `default-setup`'s `claude-code-permission-flow`
   * sits behind a `describe.skipIf` today, so this has a live subject.
   */
  it('drops a module that did not run, which reports 0 rather than nothing', () => {
    const run = reported(
      mod('@abuddy/host', 'tests/database/write-lock.spec.ts', 4890),
      mod('@abuddy/host', 'tests/skipped-entirely.spec.ts', 0, true),
    );
    expect(durationsOf(run, ONE)).toEqual([row('abuddy-host', 'tests/database/write-lock.spec.ts', 4890)]);
  });

  it('takes a half from the filename, as every other consumer of a spec path does', () => {
    const covered = UNIT_SUITES.filter((suite) => suite.dir === 'abuddy-cli');
    const run = reported(
      mod('@abuddy/cli', 'tests/build/facade-typing.integration.spec.ts', 39800),
      mod('@abuddy/cli', 'tests/commands/run-install.spec.ts', 3234),
    );
    expect(durationsOf(run, covered).map((found) => found.half)).toEqual(['integration', 'fast']);
  });

  it('says nothing about a run that reported no modules', () => {
    expect(durationsOf({ projects: ['@abuddy/host'], modules: [] }, ONE)).toEqual([]);
  });

  // Named rather than dropped: a silent drop takes the file out of the ranking, the gate and the cache at
  // once. The cause is narrower than it was — a workspace name and its vitest project name having
  // diverged — and it is the same divergence `projectsThatDidNotRun` refuses on
  it('refuses a module whose project is none of the covered suites', () => {
    const run = reported(mod('@abuddy/no-such-project', 'tests/a.spec.ts', 10));
    expect(() => durationsOf(run, ONE)).toThrow(/is none of the 1 suite/);
  });
});

describe('quantileOf', () => {
  it('takes the nearest rank, so every value it returns is one that was measured', () => {
    expect(quantileOf([10, 20, 30, 40], 0.5)).toBe(20);
    expect(quantileOf([10, 20, 30, 40], 0.9)).toBe(40);
  });

  it('has no answer for an empty set, rather than zero', () => {
    expect(quantileOf([], 0.9)).toBeUndefined();
  });
});

describe('tailBar', () => {
  // The two halves are separate populations — measured 2026-10-05, a 16ms median against 4,870ms — so a
  // bar taken over both describes neither. Today each pool measures one half, so this is construction
  // rather than a live gate, and the case is what holds the construction
  it('is each half\'s own, not one bar over both', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, index) => row('abuddy-host', `tests/f${index}.spec.ts`, (index + 1) * 10)),
      ...Array.from({ length: 10 }, (_, index) => row('abuddy-cli', `tests/g${index}.integration.spec.ts`, (index + 1) * 4000)),
    ];
    expect(tailBar(rows, 'fast')).toBe(180);
    expect(tailBar(rows, 'integration')).toBe(36_000);
    // And the number a bar over both would be, which is neither of them
    expect(quantileOf(rows.map((found) => found.ms), 0.9)).toBe(28_000);
  });

  it('has no bar for a half this run did not measure', () => {
    expect(tailBar([row('abuddy-host', 'tests/a.spec.ts', 10)], 'integration')).toBeUndefined();
  });
});

describe('slowReason', () => {
  it('reads the marker out of a leading comment block', () => {
    const source = ['// A subject line', '//', '// @slow: it spawns seven processes', 'import * as fs from \'node:fs\';'].join('\n');
    expect(slowReason(source)).toBe('it spawns seven processes');
  });

  // The header is where a reader who opened the file because it was slow will look, and restricting the
  // scan to it is also what keeps a test's own body from carrying one by accident
  it('does not read a marker past the header', () => {
    const source = ['import * as fs from \'node:fs\';', '', '// @slow: not a header'].join('\n');
    expect(slowReason(source)).toBeUndefined();
  });

  it('has no reason for a header that carries none', () => {
    expect(slowReason('// Just a subject line\nimport x from \'y\';')).toBeUndefined();
  });

  /**
   * A block-comment header carries one too, and reading only `//` lines was the defect.
   *
   * 14 of this repo's 326 specs open with a block, and on every one of them a marker was ignored
   * *silently*: the gate read the spec as unmarked, which it reports rather than fails, so a contributor
   * following the documented convention got no marker and no complaint about it either.
   */
  it('reads the marker out of a block-comment header, which is how most headers here are written', () => {
    const source = ['/**', ' * What this spec covers.', ' *', ' * @slow: it compiles a program per case', ' */', 'import x from \'y\';'].join('\n');
    expect(slowReason(source)).toBe('it compiles a program per case');
  });

  it('reads one written as a single-line block', () => {
    expect(slowReason('/* @slow: it spawns a compiler */\nimport x from \'y\';')).toBe('it spawns a compiler');
  });

  // A header is whichever comment forms open the file, in any order — the rule is where the code starts
  it('keeps reading line comments after a block header closes', () => {
    const source = ['/** A subject. */', '// @slow: still the header', 'import x from \'y\';'].join('\n');
    expect(slowReason(source)).toBe('still the header');
  });

  it('still stops where the code starts, past a block header', () => {
    const source = ['/**', ' * A subject.', ' */', 'import x from \'y\';', '', '// @slow: not a header'].join('\n');
    expect(slowReason(source)).toBeUndefined();
  });
});

describe('asLocalTime', () => {
  /**
   * A stored stamp is UTC and a printed one is the reader's own clock, and conflating them printed a time
   * four hours out — past 20:00 at UTC-4, tomorrow's date. The value exists to say how stale an answer is,
   * which is a comparison against the clock on the wall.
   */
  it('renders a UTC stamp on this machine\'s clock rather than slicing the ISO string', () => {
    const iso = '2026-10-05T23:49:17.566Z';
    const at = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, '0');
    expect(asLocalTime(iso)).toBe(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`);
    // The failure, stated as the thing that must not happen: the old rendering was a slice of the string
    if (at.getTimezoneOffset() !== 0) expect(asLocalTime(iso)).not.toBe(iso.slice(0, 16).replace('T', ' '));
  });

  it('hands back a stamp it cannot parse, rather than a line of NaN', () => {
    expect(asLocalTime('not a date')).toBe('not a date');
  });
});

describe('markedSpecs', () => {
  // Derived from the tree rather than listed, and asserted non-empty: a scan that found nothing would
  // satisfy every assertion the gate makes over it
  it('finds the markers the repo really carries', () => {
    const found = UNIT_SUITES.flatMap((suite) =>
      [...markedSpecs(path.join(REPO_ROOT, 'packages', suite.dir))].map(([file]) => `${suite.dir}/${file}`));
    expect(found.length, 'no spec carries a @slow: marker, so the gate over them looks at nothing')
      .toBeGreaterThan(0);
    for (const marked of found) expect(marked).toMatch(/\.spec\.ts$/);
  });
});

describe('placementOf', () => {
  const nine = [5, 10, 15, 20, 25, 30, 35, 40, 45].map((ms, index) => row('abuddy-host', `tests/f${index}.spec.ts`, ms));
  const marked = (file: string, reason = 'a reason'): Map<string, Map<string, string>> =>
    new Map([['abuddy-host', new Map([[file, reason]])]]);
  /** Every case below is about the gate's own logic, so each one says it had the whole half to judge from */
  const WHOLE = { whole: true } as const;

  it('fails a marked spec that is no longer in its half\'s tail, quoting its reason', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    const { stale } = placementOf(rows, marked('tests/f0.spec.ts', 'it spawns seven processes'), WHOLE);
    expect(stale).toEqual([
      { dir: 'abuddy-host', file: 'tests/f0.spec.ts', ms: 5, bar: 45, reason: 'it spawns seven processes' },
    ]);
  });

  it('leaves a marked spec that is still in the tail alone', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    expect(placementOf(rows, marked('tests/slow.spec.ts'), WHOLE).stale).toEqual([]);
  });

  // The other direction, and the reason it is not a failure: load inflates a duration by a measured 1.27x
  // median and 3.29x at worst, so a busy machine can put a file here on its own
  it('reports an unmarked spec in the slowest few without failing', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    const { stale, unmarked } = placementOf(rows, new Map(), WHOLE);
    expect(stale).toEqual([]);
    expect(unmarked.map((found) => found.file)).toEqual(['tests/slow.spec.ts']);
  });

  it('bounds that report by the ranking, not by the bar, since a tenth of a half is over it by construction', () => {
    const many = Array.from({ length: 100 }, (_, index) => row('abuddy-host', `tests/f${index}.spec.ts`, index * 10));
    expect(placementOf(many, new Map(), WHOLE).unmarked).toHaveLength(5);
    expect(placementOf(many, new Map(), { ...WHOLE, limit: 2 }).unmarked).toHaveLength(2);
  });

  // A nearest-rank quantile of a small population is its maximum, and then nothing is above the bar —
  // including the slowest file. A pool runs the projects whose inputs moved, so a run of one small
  // project is ordinary: measured 2026-10-05, `publish-checks` alone is four files and `renderer` eight
  it('checks no marker in a half too small to have a tail, and says which half', () => {
    const four = [1000, 2000, 3000, 3035].map((ms, index) => row('abuddy-host', `tests/f${index}.spec.ts`, ms));
    const { stale, unplaceable } = placementOf(four, marked('tests/f0.spec.ts'), WHOLE);
    expect(stale, 'a bar that is its own population\'s maximum places nothing, so it may fail nothing')
      .toEqual([]);
    expect(unplaceable).toEqual([{ half: 'fast', files: 4, why: 'too few files' }]);
  });

  it('says nothing about a half the run never measured', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    expect(placementOf(rows, new Map(), WHOLE).unplaceable).toEqual([]);
  });

  /**
   * And the same principle one step out: a project that *did* run is not evidence either, while the
   * projects beside it are missing.
   *
   * The case below already refuses to judge a marked spec whose project did not run, "the alternative
   * being a gate whose answer depends on which projects happened to be stale" — which is exactly what the
   * bar was, since it is the run's own p90. These two hold the same rows and differ only in `whole`, so
   * what changes the answer is the guard and not the data: a marked spec at a constant 2,900ms is stale
   * against a whole half and unjudged against part of one.
   */
  it('judges no marker from part of a half, however far under that part\'s bar a marked spec sits', () => {
    const slower = [8000, 7000, 6000, 5000, 4000, 3500].map((ms, index) => row('abuddy-host', `tests/s${index}.spec.ts`, ms));
    const faster = [100, 90, 80, 70].map((ms, index) => row('abuddy-host', `tests/q${index}.spec.ts`, ms));
    const rows = [row('abuddy-host', 'tests/marked.spec.ts', 2900), ...slower, ...faster];

    const partial = placementOf(rows, marked('tests/marked.spec.ts'), { whole: false });
    expect(partial.stale, 'it has not moved; only its neighbours have').toEqual([]);
    expect(partial.unplaceable).toEqual([{ half: 'fast', files: 11, why: 'a partial run' }]);

    const complete = placementOf(rows, marked('tests/marked.spec.ts'), WHOLE);
    expect(complete.stale.map((found) => found.bar), 'the same rows do fail a whole half, so the guard is '
      + 'what differs and not the population').toEqual([7000]);
  });

  it('still ranks a partial run, since the ranking is a report and not a gate', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    expect(placementOf(rows, new Map(), { whole: false }).unmarked.map((found) => found.file))
      .toEqual(['tests/slow.spec.ts']);
  });

  // A marked spec in a project the pool did not run is not evidence either way. The alternative is a gate
  // whose answer depends on which projects happened to be stale
  it('ignores a marked spec that this run did not measure', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    expect(placementOf(rows, marked('tests/never-ran.spec.ts'), WHOLE).stale).toEqual([]);
  });
});

describe('slowestFiles', () => {
  it('ranks a half by duration, which is the one thing vitest does not print', () => {
    const rows = [1328, 1255, 2443, 2838, 2478, 3163].map((ms, index) => row('abuddy-host', `tests/f${index}.spec.ts`, ms));
    expect(slowestFiles(rows, 'fast', 3).map((found) => found.ms)).toEqual([3163, 2838, 2478]);
  });
});

describe('the duration cache', () => {
  it('keeps a suite\'s two halves apart, so one run does not clobber the other\'s', () => {
    const root = tmpdir();
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', 10)]);
    writeDurations(root, [row('abuddy-cli', 'tests/b.integration.spec.ts', 9000)]);
    writeDurations(root, [row('abuddy-cli', 'tests/c.spec.ts', 20)]);
    expect(readDurations(root, 'abuddy-cli', 'integration')?.ms).toEqual({ 'tests/b.integration.spec.ts': 9000 });
    expect(readDurations(root, 'abuddy-cli', 'fast')?.ms).toEqual({ 'tests/c.spec.ts': 20 });
    expect(fs.readdirSync(durationCacheDir(root)).sort())
      .toEqual(['abuddy-cli.fast.json', 'abuddy-cli.integration.json', 'abuddy-host.fast.json']);
  });

  // The answer a fresh clone gives, and the one `spec:dry` has to be able to print around
  it('has no answer where no run has measured, rather than a zero', () => {
    expect(readDurations(tmpdir(), 'abuddy-host', 'fast')).toBeUndefined();
  });

  it('has no answer for a half-written file, which means the same thing', () => {
    const root = tmpdir();
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', 10)]);
    const file = path.join(durationCacheDir(root), 'abuddy-host.fast.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').slice(0, 12));
    expect(readDurations(root, 'abuddy-host', 'fast')).toBeUndefined();
  });

  it('records when it measured, so a reader can say how old the answer is', () => {
    const root = tmpdir();
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', 10)], '2026-10-05T12:00:00.000Z');
    expect(readDurations(root, 'abuddy-host', 'fast')?.measuredAt).toBe('2026-10-05T12:00:00.000Z');
  });
});

/**
 * The window each record keeps, and the one thing it must not become.
 *
 * It holds `KEPT_RUNS` readings so a creep is visible on a line already being printed. What it is *not* is
 * the window this branch deleted: that one chose which half a spec belonged in, and because the choice was
 * impossible the readings needed hysteresis, a band, a tie rule, a machine field and two idle floors.
 * Nothing compares these against an edge, which is why there is no threshold here to get wrong.
 */
/**
 * A half's whole weight, which is the number a ranking cannot give.
 *
 * The two come apart exactly where it matters: measured 2026-10-05, the five slowest files hold 46% of
 * `repo-checks`' fast half and 97% of `abuddy-sdk`'s. And the shape no top-five can show at all is many
 * files each creeping a little — 349 of 388 fast-half files are under 500ms and total 24.1s between them,
 * so every one of them could double without entering any ranking.
 */
/**
 * What a run measured, as against what the machine happens to hold.
 *
 * A pool runs only the projects whose inputs moved, so a step can run, find none of them stale and measure
 * nothing at all. Observed before this filter existed: a chain step returned in 0.8s and printed 17.3s of
 * file time over 100 files, which a direct run minutes earlier had measured. True of the machine, false of
 * that step. `since` is what makes the report a claim about one run.
 */
describe('cachedDurations', () => {
  const ONE_SUITE = UNIT_SUITES.filter((suite) => suite.dir === 'abuddy-host');
  const withRun = (measuredAt: string): string => {
    const root = tmpdir();
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', 1200)], measuredAt);
    return root;
  };

  it('reads what the cache holds when no run is named', () => {
    expect(cachedDurations(withRun('2026-10-01T00:00:00.000Z'), ONE_SUITE, 'fast')).toHaveLength(1);
  });

  it('keeps a record the named run wrote', () => {
    const root = withRun('2026-10-02T00:00:00.000Z');
    expect(cachedDurations(root, ONE_SUITE, 'fast', new Date('2026-10-01T00:00:00.000Z'))).toHaveLength(1);
  });

  // The firing case: the step ran, measured nothing, and the records predate it
  it('leaves out a record older than the run being reported on', () => {
    const root = withRun('2026-10-01T00:00:00.000Z');
    expect(cachedDurations(root, ONE_SUITE, 'fast', new Date('2026-10-02T00:00:00.000Z'))).toEqual([]);
  });
});

describe('halfTotal', () => {
  const rows = [
    row('abuddy-host', 'tests/a.spec.ts', 1200),
    row('abuddy-host', 'tests/b.spec.ts', 300),
    row('abuddy-cli', 'tests/c.integration.spec.ts', 40_000),
  ];

  it('sums one half and counts its files, leaving the other half out', () => {
    expect(halfTotal(rows, 'fast')).toEqual({ ms: 1500, files: 2 });
    expect(halfTotal(rows, 'integration')).toEqual({ ms: 40_000, files: 1 });
  });

  it('is zero over no files, which is a total and not an absence', () => {
    expect(halfTotal([], 'fast')).toEqual({ ms: 0, files: 0 });
  });
});

describe('the duration window', () => {
  it('keeps the newest run first and the older ones behind it', () => {
    const root = tmpdir();
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', 1200)], '2026-10-01T00:00:00.000Z');
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', 2900)], '2026-10-02T00:00:00.000Z');
    const runs = readDurationRuns(root, 'abuddy-host', 'fast')!;
    expect(runs.map((run) => run.measuredAt)).toEqual(['2026-10-02T00:00:00.000Z', '2026-10-01T00:00:00.000Z']);
    expect(readDurations(root, 'abuddy-host', 'fast')!.ms['tests/a.spec.ts'], 'the newest is what prices a plan').toBe(2900);
  });

  // Bounded is the whole claim: the file count never moves, so `pruneDurationCache` still answers for
  // every name in the directory, and what a record holds cannot grow without limit either
  it(`keeps at most ${KEPT_RUNS} runs`, () => {
    const root = tmpdir();
    for (let n = 0; n < KEPT_RUNS + 4; n += 1) {
      writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', n)], `2026-10-01T00:00:${String(n).padStart(2, '0')}.000Z`);
    }
    const runs = readDurationRuns(root, 'abuddy-host', 'fast')!;
    expect(runs).toHaveLength(KEPT_RUNS);
    expect(runs[0]!.ms['tests/a.spec.ts'], 'the newest survives').toBe(KEPT_RUNS + 3);
  });

  // The uncommitted cache is rebuilt by any run, so refusing a record written before the window existed
  // would lose a measurement for nothing
  it('reads a record from before the window as a window of one', () => {
    const root = tmpdir();
    fs.mkdirSync(durationCacheDir(root), { recursive: true });
    fs.writeFileSync(path.join(durationCacheDir(root), 'abuddy-host.fast.json'),
      JSON.stringify({ measuredAt: '2026-10-01T00:00:00.000Z', ms: { 'tests/a.spec.ts': 500 } }));
    expect(readDurationRuns(root, 'abuddy-host', 'fast')).toHaveLength(1);
    expect(readDurations(root, 'abuddy-host', 'fast')!.ms['tests/a.spec.ts']).toBe(500);
  });

  it('has no window where no run has measured, and none for a half-written file', () => {
    const root = tmpdir();
    expect(readDurationRuns(root, 'abuddy-host', 'fast')).toBeUndefined();
    fs.mkdirSync(durationCacheDir(root), { recursive: true });
    fs.writeFileSync(path.join(durationCacheDir(root), 'abuddy-host.fast.json'), '{"runs": [{"measu');
    expect(readDurationRuns(root, 'abuddy-host', 'fast')).toBeUndefined();
  });
});

describe('trendOf', () => {
  const twoRuns = (first: number, second: number): string => {
    const root = tmpdir();
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', first)], '2026-10-01T00:00:00.000Z');
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', second)], '2026-10-02T00:00:00.000Z');
    return root;
  };

  it('reports the oldest reading the window holds, and how many it rests on', () => {
    expect(trendOf(twoRuns(1200, 2900), 'abuddy-host', 'fast', 'tests/a.spec.ts')).toEqual({ was: 1200, runs: 2 });
  });

  // No verdict and no threshold: a drop is reported exactly as a rise is, because nothing acts on either
  it('reports a spec that got faster the same way', () => {
    expect(trendOf(twoRuns(2900, 1200), 'abuddy-host', 'fast', 'tests/a.spec.ts')).toEqual({ was: 2900, runs: 2 });
  });

  it('has nothing to say about a window of one, or a spec the window has not seen twice', () => {
    const root = tmpdir();
    writeDurations(root, [row('abuddy-host', 'tests/a.spec.ts', 1200)], '2026-10-01T00:00:00.000Z');
    expect(trendOf(root, 'abuddy-host', 'fast', 'tests/a.spec.ts'), 'one reading is not a trend').toBeUndefined();
    writeDurations(root, [row('abuddy-host', 'tests/b.spec.ts', 90)], '2026-10-02T00:00:00.000Z');
    expect(trendOf(root, 'abuddy-host', 'fast', 'tests/b.spec.ts'), 'seen in one run of two').toBeUndefined();
  });
});

describe('asDuration', () => {
  // The fast half's median is 16ms, which `(ms / 1000).toFixed(1)` renders as `0.0s` — so most of a
  // ranking of that half was printing the same three characters
  it('reads a fast spec in milliseconds and a slow one in seconds', () => {
    expect(asDuration(16)).toBe('16ms');
    expect(asDuration(999)).toBe('999ms');
    expect(asDuration(1000)).toBe('1.0s');
    expect(asDuration(17_745)).toBe('17.7s');
  });
});

/**
 * What a prune leaves, which is what says a file in the cache answers for nobody.
 *
 * The live set is the halves a suite *has*, read from the configs in the tree it is given — not every half
 * there is. A cross product admits `<dir>.integration.json` for the nine packages with one config, and a
 * name no run would write is one the prune then never removes, which is the growing cache its own comment
 * warns about. These cases build the tree too, since the configs are what the answer is derived from.
 */
describe('pruneDurationCache', () => {
  /** A root holding the configs a real checkout would, so the derivation has something to read */
  const rootWith = (halves: Readonly<Record<string, readonly Half[]>>, records: readonly string[]): string => {
    const root = tmpdir();
    for (const [dir, has] of Object.entries(halves)) {
      const at = path.join(root, 'packages', dir);
      fs.mkdirSync(at, { recursive: true });
      for (const half of has) fs.writeFileSync(path.join(at, CONFIG_BY_HALF[half]), '');
    }
    fs.mkdirSync(durationCacheDir(root), { recursive: true });
    for (const name of records) fs.writeFileSync(path.join(durationCacheDir(root), name), '{}\n');
    return root;
  };
  const left = (root: string): string[] => fs.readdirSync(durationCacheDir(root)).sort();

  const split = UNIT_SUITES.find((suite) => fs.existsSync(path.join(REPO_ROOT, 'packages', suite.dir, CONFIG_BY_HALF.integration)))!;
  const single = UNIT_SUITES.find((suite) => !fs.existsSync(path.join(REPO_ROOT, 'packages', suite.dir, CONFIG_BY_HALF.integration)))!;

  it('finds both kinds of suite in the real tree, or the cases below prove nothing', () => {
    expect(split, 'no unit suite has an integration config').toBeDefined();
    expect(single, 'every unit suite has an integration config').toBeDefined();
  });

  it('keeps both halves of a suite whose package has both configs', () => {
    const root = rootWith({ [split.dir]: ['fast', 'integration'] }, [`${split.dir}.fast.json`, `${split.dir}.integration.json`]);
    pruneDurationCache(root);
    expect(left(root)).toEqual([`${split.dir}.fast.json`, `${split.dir}.integration.json`].sort());
  });

  // The firing case the cross product did not have: a record for a half its package has no config for is
  // one no pool would ever write, and the old live set called it alive
  it('drops an integration record for a suite with no integration half', () => {
    const root = rootWith({ [single.dir]: ['fast'] }, [`${single.dir}.fast.json`, `${single.dir}.integration.json`]);
    pruneDurationCache(root);
    expect(left(root)).toEqual([`${single.dir}.fast.json`]);
  });

  it('drops a record for a package that is gone', () => {
    const root = rootWith({ [single.dir]: ['fast'] }, ['no-such-package.fast.json']);
    pruneDurationCache(root);
    expect(left(root)).toEqual([]);
  });

  it('leaves anything that is not a record alone, and a missing directory is not an error', () => {
    const root = rootWith({ [single.dir]: ['fast'] }, ['README.md']);
    pruneDurationCache(root);
    expect(left(root)).toEqual(['README.md']);
    expect(() => pruneDurationCache(tmpdir())).not.toThrow();
  });
});
