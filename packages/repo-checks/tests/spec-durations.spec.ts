// Reading a pool run's own output back, which is the same bet `slow-tests.ts` makes and carries the same
// risk: it is a parser over someone else's format, so every shape it must handle is pinned here rather
// than taken from one invented line. The gate over it is pinned in both directions, because the two are
// not symmetrical — a marked spec that reads fast fails the step, and an unmarked one that reads slow is
// only ever reported, since load can inflate a duration and cannot shorten one.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import {
  asDuration, asLocalTime, durationCacheDir, fileDurations, markedSpecs, placementOf, pruneDurationCache,
  quantileOf, readDurations, slowestFiles, slowReason, tailBar, writeDurations, type FileDuration,
} from '../../../scripts/lib/spec-durations.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';
import { CONFIG_BY_HALF, type Half } from '../../../scripts/lib/spec-halves.ts';

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

describe('fileDurations', () => {
  it('reads the bare file lines a single-project run prints, attributing them by path', () => {
    const output = [
      ' ✓ tests/database/write-lock.spec.ts (4 tests) 4890ms',
      '   ✓ a nested case 300ms',
      ' ✓ tests/build/published-manifest.spec.ts (7 tests) 2838ms',
    ].join('\n');
    expect(fileDurations(output, ONE, REPO_ROOT)).toEqual([
      row('abuddy-host', 'tests/database/write-lock.spec.ts', 4890),
      row('abuddy-host', 'tests/build/published-manifest.spec.ts', 2838),
    ]);
  });

  it('reads the piped project label a multi-project run prints without colour', () => {
    const output = ' ✓ |@abuddy/sdk| tests/build/generate-entries.spec.ts (94 tests) 17745ms';
    expect(fileDurations(output, HOST, REPO_ROOT)).toEqual([
      row('abuddy-sdk', 'tests/build/generate-entries.spec.ts', 17745),
    ]);
  });

  // The label is the one thing that differs between a coloured run and a piped one, and reading only the
  // piped spelling is what once had `projectsThatRan` report all eleven host projects absent from a run
  // every one of them had passed in
  it('reads the coloured project label, which strips to bare text rather than to pipes', () => {
    const output = ' \u001B[32m✓\u001B[39m \u001B[42m @abuddy/sdk \u001B[49m tests/build/generate-entries.spec.ts (94 tests) 17745ms';
    expect(fileDurations(output, HOST, REPO_ROOT)).toEqual([
      row('abuddy-sdk', 'tests/build/generate-entries.spec.ts', 17745),
    ]);
  });

  // The label and the path cover each other exactly: a label is printed only on a run of two or more
  // projects, and `tests/source-layout.spec.ts` — the one path two suites share — can only be ambiguous
  // on such a run, where the label resolves it
  it('prefers the label where a path alone would be ambiguous', () => {
    const covered = UNIT_SUITES.filter((suite) => ['api', 'renderer'].includes(suite.dir));
    const output = ' ✓ |@app/renderer| tests/source-layout.spec.ts (3 tests) 55ms';
    expect(fileDurations(output, covered, REPO_ROOT)).toEqual([
      row('renderer', 'tests/source-layout.spec.ts', 55),
    ]);
  });

  /**
   * Tolerates a duration in seconds, which **no vitest 3.2.4 file line uses**.
   *
   * Said plainly because the title used to claim the opposite — "which is how vitest prints anything over
   * a second" — and that is exactly the invented line this file's header promises it does not pin against.
   * `getDurationPrefix` rounds a module's duration to milliseconds unconditionally (`4851ms`, never
   * `4.85s`); only the run's own summary uses seconds. So this is the unit arm's tolerance being exercised
   * rather than a format anyone has observed, and the edit that would make it real is vitest formatting a
   * file's duration the way it formats the summary's.
   */
  it('tolerates a duration in seconds, which no file line vitest prints today uses', () => {
    const output = ' ✓ tests/database/write-lock.spec.ts (4 tests) 4.89s';
    expect(fileDurations(output, ONE, REPO_ROOT)[0]!.ms).toBe(4890);
  });

  /**
   * And refuses an output that reported files with no duration among them.
   *
   * The two causes of an empty parse are not alike: a reporter whose per-file format moved leaves these
   * lines matching and the duration pattern matching nothing, and passing over that is a step that checks
   * no marker and says so to nobody — the failure `projectsThatRan` already shipped once here, reading
   * only vitest's uncoloured label. A run that reported no files at all simply ran nothing.
   */
  it('refuses an output that reported files and not one duration', () => {
    const output = [' ✓ tests/database/write-lock.spec.ts (4 tests)', ' ✓ tests/packs/undo-log.spec.ts (3 tests)'].join('\n');
    expect(() => fileDurations(output, ONE, REPO_ROOT)).toThrow(/not one duration among them/);
  });

  /**
   * And refuses it wherever in the run those lines sit, which is the half this case was blind to.
   *
   * A real run opens with npm's banner and vitest's own header, so a file line is never the first line.
   * The pattern was `^`-anchored without `m`, which anchors to the start of the *string*, and the case
   * above passed only because its fixture began with one. Mutating `FILE` and running the real pack pool
   * is what found it: 100 files reported, no duration parsed, and the step passed and stamped itself.
   */
  it('refuses it when the file lines are not the first thing the run printed', () => {
    const output = ['', '> @app/default-setup@0.0.0 test', '> vitest run', '', ' RUN  v3.2.4', '',
      ' ✓ tests/database/write-lock.spec.ts (4 tests)', ''].join('\n');
    expect(() => fileDurations(output, ONE, REPO_ROOT)).toThrow(/not one duration among them/);
  });

  // The skipped mark is why that refusal reads a second pattern rather than counting lines: a skipped file
  // carries no duration honestly, so a suite behind a `skipIf` must report nothing rather than fail
  it('says nothing about a run whose every file was skipped, which carries no durations', () => {
    expect(fileDurations(' ↓ tests/database/write-lock.spec.ts (4 tests)', ONE, REPO_ROOT)).toEqual([]);
  });

  it('says nothing about an output that reported no files at all', () => {
    expect(fileDurations('some output with no file lines\n\n Test Files  no tests\n', ONE, REPO_ROOT)).toEqual([]);
  });

  it('takes a half from the filename, as every other consumer of a spec path does', () => {
    const output = [
      ' ✓ |@abuddy/cli| tests/build/facade-typing.integration.spec.ts (2 tests) 39800ms',
      ' ✓ |@abuddy/cli| tests/commands/run-install.spec.ts (9 tests) 3234ms',
    ].join('\n');
    const covered = UNIT_SUITES.filter((suite) => suite.dir === 'abuddy-cli');
    expect(fileDurations(output, covered, REPO_ROOT).map((found) => found.half)).toEqual(['integration', 'fast']);
  });

  it('leaves a per-test line alone, which carries no test count and no path', () => {
    expect(fileDurations('   ✓ a suite > a slow case 830ms', ONE, REPO_ROOT)).toEqual([]);
  });

  // Named rather than dropped: the one way it happens is vitest changing how it labels a project, and a
  // silent drop takes the file out of the ranking, the gate and the cache at once
  it('refuses a file it cannot attribute to any covered suite', () => {
    expect(() => fileDurations(' ✓ tests/nowhere/invented.spec.ts (1 test) 10ms', ONE, REPO_ROOT))
      .toThrow(/belongs to none of the 1 suite/);
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

  it('fails a marked spec that is no longer in its half\'s tail, quoting its reason', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    const { stale } = placementOf(rows, marked('tests/f0.spec.ts', 'it spawns seven processes'));
    expect(stale).toEqual([
      { dir: 'abuddy-host', file: 'tests/f0.spec.ts', ms: 5, bar: 45, reason: 'it spawns seven processes' },
    ]);
  });

  it('leaves a marked spec that is still in the tail alone', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    expect(placementOf(rows, marked('tests/slow.spec.ts')).stale).toEqual([]);
  });

  // The other direction, and the reason it is not a failure: load inflates a duration by a measured 1.27x
  // median and 3.29x at worst, so a busy machine can put a file here on its own
  it('reports an unmarked spec in the slowest few without failing', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    const { stale, unmarked } = placementOf(rows, new Map());
    expect(stale).toEqual([]);
    expect(unmarked.map((found) => found.file)).toEqual(['tests/slow.spec.ts']);
  });

  it('bounds that report by the ranking, not by the bar, since a tenth of a half is over it by construction', () => {
    const many = Array.from({ length: 100 }, (_, index) => row('abuddy-host', `tests/f${index}.spec.ts`, index * 10));
    expect(placementOf(many, new Map()).unmarked).toHaveLength(5);
    expect(placementOf(many, new Map(), { limit: 2 }).unmarked).toHaveLength(2);
  });

  // A nearest-rank quantile of a small population is its maximum, and then nothing is above the bar —
  // including the slowest file. A pool runs the projects whose inputs moved, so a run of one small
  // project is ordinary: measured 2026-10-05, `publish-checks` alone is four files and `renderer` eight
  it('checks no marker in a half too small to have a tail, and says which half', () => {
    const four = [1000, 2000, 3000, 3035].map((ms, index) => row('abuddy-host', `tests/f${index}.spec.ts`, ms));
    const { stale, unplaceable } = placementOf(four, marked('tests/f0.spec.ts'));
    expect(stale, 'a bar that is its own population\'s maximum places nothing, so it may fail nothing')
      .toEqual([]);
    expect(unplaceable).toEqual([{ half: 'fast', files: 4 }]);
  });

  it('says nothing about a half the run never measured', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    expect(placementOf(rows, new Map()).unplaceable).toEqual([]);
  });

  // A marked spec in a project the pool did not run is not evidence either way. The alternative is a gate
  // whose answer depends on which projects happened to be stale
  it('ignores a marked spec that this run did not measure', () => {
    const rows = [...nine, row('abuddy-host', 'tests/slow.spec.ts', 5000)];
    expect(placementOf(rows, marked('tests/never-ran.spec.ts')).stale).toEqual([]);
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
