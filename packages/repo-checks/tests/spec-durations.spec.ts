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
  asDuration, durationCacheDir, fileDurations, markedSpecs, placementOf, quantileOf, readDurations,
  slowestFiles, slowReason, tailBar, writeDurations, type FileDuration,
} from '../../../scripts/lib/spec-durations.ts';
import { UNIT_SUITES } from '../../../scripts/lib/unit-suites.ts';

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

  it('reads a time in seconds, which is how vitest prints anything over a second', () => {
    const output = ' ✓ tests/database/write-lock.spec.ts (4 tests) 4.89s';
    expect(fileDurations(output, ONE, REPO_ROOT)[0]!.ms).toBe(4890);
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
