// How a chain run puts a step on a line. The chain's own file runs the chain on import, so the formatting lives
// in `scripts/lib/chain-output.ts` where a spec can reach it without starting a six-minute build.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstChange, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from '../../../scripts/lib/chain-steps.ts';
import { briefly, classifyLine, declaredAt, dim, driftReport, DRY_REASON_COLUMN, howLong, shouldClassify, identicalRewrites, oneLine, REASON_COLUMN, staleLines, STEP_NAME_WIDTH, TIME_COLUMN, wrapAt, whenChanged, writerOf } from '../../../scripts/lib/chain-output.ts';

describe('wrapAt', () => {
  /**
   * The whole point: a continuation indented to the reason's own column reads as part of that row. Wrapped to
   * column 0 it reads as another step's line, which is what a 180-character reason did to every run that
   * printed one.
   */
  it('indents what it wraps to the column the reason starts at, and leaves what fits', () => {
    const wrapped = wrapAt(10, 'one two three four five six seven', 24);
    expect(wrapped.split('\n')).toEqual(['one two three four', '          five six seven']);
    expect(wrapAt(46, 'never cached', 120)).toBe('never cached');
  });

  /** A path or a flag cut in half is worse than a ragged edge, so a word longer than the room keeps its line */
  it('does not break a word that is wider than the room', () => {
    expect(wrapAt(10, `short ${'x'.repeat(40)}`, 30)).toBe(`short\n${' '.repeat(10)}${'x'.repeat(40)}`);
  });

  /** A narrow terminal still gets a column to wrap to, rather than one word per line */
  it('keeps a floor under the room it wraps to', () => {
    expect(wrapAt(100, 'one two three four five', 101).split('\n')[0]).toBe('one two three four');
  });
});

describe('oneLine', () => {
  /** The slowest tests are a list to scan, and wrapping them costs three lines each on a narrow terminal */
  it('cuts a name to the room it has, says it cut, and leaves one that fits', () => {
    expect(oneLine(10, 'a test with a very long name indeed', 30)).toBe('a test with a very…');
    expect(oneLine(46, 'a quick test', 120)).toBe('a quick test');
  });
});

describe('dim', () => {
  /** A log file and a CI capture are not terminals, and an escape code in one is noise nobody asked for */
  it('leaves text alone when the output is not a terminal', () => {
    expect(dim('cached')).toBe(process.stdout.isTTY ? '\u001B[2mcached\u001B[22m' : 'cached');
  });
});

describe('writerOf', () => {
  const steps = [{ name: 'compile', outputs: ['packages/demo-pack/generated'] }, { name: 'typecheck' }];

  it('names the step whose outputs hold the file', () => {
    expect(writerOf('packages/demo-pack/generated/library.seed.json', steps)).toBe('compile');
  });

  /** Nobody's output is the interesting answer: an undeclared write is the one there is something to do about */
  it('answers nothing for a file no step declares', () => {
    expect(writerOf('tests/packs/probe.txt', steps)).toBeUndefined();
  });
});

describe('whenChanged', () => {
  const ranFrom = Date.parse('2026-09-27T12:00:00.000Z');
  const ranUntil = Date.parse('2026-09-27T12:01:00.000Z');

  /** A write inside the run is the case with an ordering to fix; one after it is usually the reader's own edit */
  it('places a change inside the run, and after it', () => {
    expect(whenChanged(ranFrom + 1000, ranFrom, ranUntil)).toBe('while it ran');
    expect(whenChanged(ranUntil + 1000, ranFrom, ranUntil)).toBe('since it ran');
  });

  /**
   * The file differs from what the stamp recorded at `takenAt`, so an mtime older than that is not telling the
   * truth — something restored it. Saying "while it ran" there invents a window, which is the whole mistake this
   * report was rebuilt to stop making.
   */
  it('refuses to place a change whose mtime predates the run', () => {
    expect(whenChanged(ranFrom - 1000, ranFrom, ranUntil)).toBe('though its mtime predates the run');
  });

  /** A stamp from before the run window was recorded says nothing about when, and must not guess */
  it('says nothing when the stamp cannot place it', () => {
    expect(whenChanged(ranFrom, ranFrom, undefined)).toBe('');
    expect(whenChanged(ranFrom, undefined, ranUntil)).toBe('');
    expect(whenChanged(undefined, ranFrom, ranUntil)).toBe('');
  });
});

describe('identicalRewrites', () => {
  const [from, until] = [Date.parse('2026-09-27T12:00:00.000Z'), Date.parse('2026-09-27T12:01:00.000Z')];
  const at: Record<string, number> = {
    'src/rewritten.ts': from + 10_000,
    'src/touched-later.ts': until + 10_000,
    'src/untouched.ts': from - 90 * 24 * 60 * 60 * 1000,
    'src/changed.ts': from + 20_000,
  };
  const under = (differing: string[] = [], window: [number | undefined, number | undefined] = [from, until]) =>
    identicalRewrites({
      recorded: Object.keys(at), differing: new Set(differing), mtimeOf: (file) => at[file], from: window[0], until: window[1],
    });

  it('counts a file whose bytes match and which was written inside the run', () => {
    expect(under(['src/changed.ts'])).toEqual(['src/rewritten.ts']);
  });

  /**
   * Measured rather than reasoned: a rewriter left running past `typecheck`'s window produced exactly this, and
   * the report was right to say nothing — mtime records the last write, so this can only undercount.
   */
  it('leaves out one whose last write landed after the run finished', () => {
    expect(under(['src/changed.ts'])).not.toContain('src/touched-later.ts');
  });

  /** A file that differs is a cause, and a cause must never be demoted to a harmless footnote */
  it('leaves out every file that differs, whatever its mtime says', () => {
    expect(under(['src/changed.ts', 'src/rewritten.ts']), 'a file that differs was counted as harmless').toEqual([]);
  });

  it('counts nothing when the stamp cannot say when the run was', () => {
    expect(under([], [undefined, until])).toEqual([]);
    expect(under([], [from, undefined])).toEqual([]);
  });
});

/**
 * `--dry` has one line per step and a cold tree makes every step stale, so what moved has to fit the row it is
 * already on. It replaces a sentence that was identical for every stale step.
 */
describe('firstChange', () => {
  const nothing = { gained: [], lost: [], changed: [], added: [], removed: [] };

  it('leads with the verb, so a column of these lines reads down', () => {
    expect(firstChange({ ...nothing, changed: ['scripts/chain.ts'] })).toBe('changed scripts/chain.ts');
    expect(firstChange({ ...nothing, added: ['tests/packs/probe.txt'] })).toBe('added tests/packs/probe.txt');
    expect(firstChange({ ...nothing, removed: ['src/gone.ts'] })).toBe('removed src/gone.ts');
  });

  it('counts the rest across all three kinds, since the row has no room for them', () => {
    expect(firstChange({ ...nothing, changed: ['a.ts', 'b.ts'], added: ['c.ts'], removed: ['d.ts'] }))
      .toBe('changed a.ts (and 3 more)');
  });

  /** A unit that gained a watched path is stale before a byte moved, so naming a file would name a non-cause */
  it('names a declared path over any file', () => {
    expect(firstChange({ ...nothing, gained: ['tests/scripts'], changed: ['a.ts'] })).toBe('gained tests/scripts');
    expect(firstChange({ ...nothing, lost: ['tests/old'] })).toBe('lost tests/old');
  });

  /** Empty rather than a guess, so the caller falls back to the reason it already had */
  it('says nothing when there is nothing to name', () => {
    expect(firstChange(nothing)).toBe('');
  });
});

describe('staleLines', () => {
  const under = (found: Partial<Parameters<typeof staleLines>[0]>) => staleLines({
    name: 'typecheck', nameWidth: 'typecheck'.length, gained: [], lost: [], files: [], identical: [], recorded: true, ...found,
  // Matching the control character is the job: the chain's own output is coloured, and this reads it plain.
  // eslint-disable-next-line no-control-regex
  }).map((line) => line.replace(/\u001B\[\d+m/g, '').trimEnd());

  /**
   * The first finding shares the step's row, and the rest sit under it — two lines of screen for the usual case
   * of one step and one file. Each path is padded to the widest this step names, so the qualifiers form a column.
   */
  it('names each file with what happened to it, when, and whose output it is', () => {
    expect(under({ files: [
      { file: 'tests/packs/probe.txt', how: 'changed', when: 'while it ran' },
      { file: 'packages/demo-pack/dist/seeds.json', how: 'added', when: 'since it ran', writer: 'compile' },
    ] })).toEqual([
        '  typecheck  tests/packs/probe.txt               changed while it ran',
      "             packages/demo-pack/dist/seeds.json  added since it ran, compile's declared output",
    ]);
  });

  /** The verdict is the header's, not the row's — except when it is not the one every step here shares */
  it('prints a reason only when it is not the ordinary one', () => {
    expect(under({ reason: 'not built (no packages/abuddy-sdk/dist)', files: [{ file: 'src/a.ts', how: 'changed', when: '' }] }))
      .toEqual(['  typecheck  not built (no packages/abuddy-sdk/dist)']);
  });

  /**
   * The line the whole change is for. An identical rewrite is not a cause, and reading one as a cause is what
   * sent a diagnosis after the compiled seed an E2E test rewrites; it is still worth saying, because a tree written
   * during every run is worth knowing about — and worth naming, since a count is not something anyone can know.
   */
  it('names the file whose mtime moved while its bytes did not', () => {
    expect(under({
      files: [{ file: 'tests/packs/probe.txt', how: 'changed', when: 'while it ran' }],
      identical: ['packages/demo-pack/dist/library.seed.json', 'packages/demo-pack/dist/notes.seed.json'],
    })).toEqual([
      '  typecheck  tests/packs/probe.txt  changed while it ran',
      '             · packages/demo-pack/dist/library.seed.json and 1 more — touched during the run, not changed',
    ]);
  });

  /**
   * A unit that gains a watched path is stale before a byte moves, so a file list for that cause is empty —
   * printing both would read as a contradiction, and printing only the files would read as a bug.
   */
  it('reports a declared-set change instead of files, because no file moved', () => {
    expect(under({ gained: ['tests/scripts'], lost: ['tests/old'] }))
      .toEqual(['  typecheck  its declared inputs moved: +tests/scripts, -tests/old']);
  });

  it('counts the rest past the cap rather than filling the screen', () => {
    const files = Array.from({ length: 8 }, (_, index) => ({ file: `src/f${index}.ts`, how: 'changed' as const, when: '' as const }));
    const lines = under({ files, cap: 3 });
    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toBe('             and 5 more');
  });

});

describe('declaredAt', () => {
  it('finds the line a step is declared on', () => {
    const table = ["  // why it is never cached", "  { name: 'test', tier: 3, cache: false,", '  },'].join('\n');
    expect(declaredAt(table, 'test')).toBe(2);
  });

  /** A rename degrades to no pointer rather than to a wrong one, which is why the caller takes `undefined` */
  it('answers nothing for a name the table does not hold', () => {
    expect(declaredAt("  { name: 'test' },", 'compile')).toBeUndefined();
  });
});

describe('briefly', () => {
  /**
   * A never-cached step's sentence explains a design choice and is the same on every run — the longest text on
   * the screen and the least specific to the run in front of you. So the run points at where the reasoning is
   * kept, `--dry` prints it, and the argument stays in the comment above the step, its only copy.
   */
  it('points at the reasoning for a step that is never cached, rather than repeating it', () => {
    expect(briefly('never cached: it drives real Electron, and a flaky pass cached green hides a failure',
      'scripts/lib/chain-steps.ts:518')).toBe('never cached — scripts/lib/chain-steps.ts:518');
  });

  it('still says the verdict when there is nowhere to point', () => {
    expect(briefly('never cached: it drives real Electron')).toBe('never cached');
  });

  it('leaves a reason that is about this run', () => {
    const why = 'its inputs changed since the last successful run';
    expect(briefly(why)).toBe(why);
  });
});

/**
 * And it lands on the step in the table a run actually points at. A pointer that resolves to an unrelated line
 * sends a reader somewhere with confidence, which is worse than printing nothing — and the only thing that could
 * move it is the table's own formatting, which nothing else here would notice.
 */
it('points at the line each never-cached step is declared on', () => {
  const table = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/chain-steps.ts'), 'utf-8');
  const lines = table.split('\n');
  const neverCached = CHAIN_STEPS.filter((step) => step.cache === false);
  expect(neverCached.length, 'no step is never cached, so this would pass over nothing').toBeGreaterThan(0);
  for (const step of neverCached) {
    const at = declaredAt(table, step.name);
    expect(at, `${step.name} is declared somewhere this cannot find`).toBeDefined();
    expect(lines[at! - 1]).toContain(`name: '${step.name}'`);
  }
});

/**
 * And every row agrees with the lines under it, for the name that is hardest to fit.
 *
 * Asserted with the **longest** declared step name, because the previous version of this case composed the
 * column from `'x'` — a name shorter than the width, so `padEnd` always applied and the assertion held whatever
 * the real names were. It passed while all three row shapes were a column out for `test:external-pack:contract`,
 * which is the one step in the table wider than the column was.
 *
 * The end-of-run report is not here: it sizes its column to the names it is printing, and `staleLines`' own
 * cases assert the rows it composes.
 *
 * It also holds that both rows wrap to the columns declared for them rather than to a literal, which is the
 * half of the old `composes both rows` case that this one did not already cover. The other half of that case
 * asserted `REASON_COLUMN - DRY_REASON_COLUMN === 8`, and went with it: both are now `STEP_NAME_WIDTH` plus a
 * constant, so the difference is arithmetic that cannot drift.
 */
it('lines every row up with what sits under it, for the widest step name', () => {
  const chain = fs.readFileSync(path.join(REPO_ROOT, 'scripts/chain.ts'), 'utf-8');
  expect(chain, 'a row pads the name by something other than the shared width').not.toMatch(/padEnd\(\d/);
  expect(chain, "a run's rows wrap to something other than the declared column").toContain('wrapAt(REASON_COLUMN');
  expect(chain, "`--dry`'s rows wrap to something other than the declared column").toContain('wrapAt(DRY_REASON_COLUMN');

  const widest = [...CHAIN_STEPS].sort((a, b) => b.name.length - a.name.length)[0]!.name;
  const name = widest.padEnd(STEP_NAME_WIDTH);
  // Built the way chain.ts builds them, so a change to either shape fails here rather than on a terminal
  expect(`${'ok'.padStart(7)} t1 ${name} ${'26.1s'.padStart(6)}  `.length, "a run row's reason").toBe(REASON_COLUMN);
  expect(`${'run'.padStart(7)} t1 ${name} `.length, "a --dry row's reason").toBe(DRY_REASON_COLUMN);
  expect(`${'ok'.padStart(7)} t1 ${name} `.length, "a run row's time").toBe(TIME_COLUMN);
});

/** So a step name longer than the column fails by name, rather than knocking every line under it one to the left */
it('keeps the name column at least as wide as the widest step name', () => {
  const widest = [...CHAIN_STEPS].sort((a, b) => b.name.length - a.name.length)[0]!.name;
  expect(STEP_NAME_WIDTH, `${widest} does not fit; widen STEP_NAME_WIDTH to ${widest.length}`)
    .toBeGreaterThanOrEqual(widest.length);
});

describe('howLong', () => {
  /**
   * The timeout branch of the chain's failure report already says what a step costs healthy and what to
   * conclude; an ordinary failure said only its exit code. One unexplained `test:integration` failure then
   * took a reader into `chain-steps.ts` and `budgetFor` by hand to find out it had not been killed.
   */
  it('says what it cost against what it costs healthy, and at how many lanes', () => {
    expect(howLong({ seconds: 60 }, 47_000, 3)).toBe(' after 47.0s, against 60s healthy at 3 lanes');
  });

  it('says lane, not lanes, when there is one', () => {
    expect(howLong({ seconds: 60 }, 47_000, 1)).toContain('at 1 lane');
    expect(howLong({ seconds: 60 }, 47_000, 1)).not.toContain('lanes');
  });

  it('points at a single-lane run only when the step was slow enough for contention to explain it', () => {
    // Past double the declared cost, which is `driftedSteps`' band rather than a second threshold
    expect(howLong({ seconds: 60 }, 130_000, 3)).toContain('--lanes 1');
    // A step that failed at its normal speed failed on its merits, and suggesting a re-run would be noise
    expect(howLong({ seconds: 60 }, 61_000, 3)).not.toContain('--lanes 1');
  });

  it('says nothing for a step that declares no cost, rather than reporting undefined', () => {
    expect(howLong({}, 47_000, 3)).toBe('');
  });
});

describe('driftReport', () => {
  const drifted = [
    { name: 'test:external-pack:contract', declared: 57, measured: 18 },
    { name: 'typecheck', declared: 27, measured: 11 },
  ];

  it('prints the value to record, when the run is comparable to the table', () => {
    const report = driftReport(drifted, 3, 3, true);

    expect(report).toContain('re-measure, or record');
    expect(report).toContain('seconds: 57 -> 18');
  });

  /**
   * Measured: a `--lanes 1` run reports exactly these two, and the old report told the reader to record 18 for
   * a step that costs 57s in the default schedule — which `budgetFor` turns into a 72s kill budget, the
   * mis-sized bound `seconds`' own doc warns about. The numbers are real; only "record them" was wrong.
   */
  it('names the spread instead, when the run used another lane count', () => {
    const report = driftReport(drifted, 1, 3, true);

    expect(report).not.toContain('record');
    expect(report).toContain('at 1 lane, 2 steps moved against 3-lane numbers');
    expect(report).toContain('57s -> 18s  (3.2x faster alone)');
  });

  it('says slower when more lanes made a step slower, not faster', () => {
    expect(driftReport([{ name: 'typecheck', declared: 27, measured: 54 }], 6, 3, true)).toContain('(2.0x slower)');
  });

  /**
   * Measured: a gate run with nine of twelve steps cached reported `typecheck seconds: 27 -> 12`. Three lanes
   * with almost everything cached is no contention at all, so the step ran at its solo speed and the lane
   * count — which is what the first version of this gated on — said nothing about it.
   */
  it('says nothing about a step that came in under the band, on a run that did less work', () => {
    expect(driftReport(drifted, 3, 3, false)).toBe('');
    expect(driftReport(drifted, 1, 3, false)).toBe('');
  });

  /**
   * The other direction is not the run's doing: less contention cannot make a step slower, so an overrun on a
   * partial run is the step growing. It is also the direction that ends in a kill — `budgetFor` is four times
   * — which is why this one is reported whatever the run did. Measured over 40 step runs in a day: 6 under the
   * band, 0 over it, so saying it always costs no noise.
   */
  it('names a step that ran past double, on any run, and what it is heading toward', () => {
    const grew = [{ name: 'typecheck', declared: 27, measured: 61 }];

    const report = driftReport(grew, 3, 3, false);

    expect(report).toContain('the step grew, not the schedule');
    expect(report).toContain('27s -> 61s  (killed at 108s)');
  });

  /**
   * `budgetFor` floors at 60s, so four times is not the budget for a cheap step. Caught by a real run, where a
   * declared 5s printed "killed at 20s" — the unit case above uses 27s, where the floor never shows.
   */
  it('names the real budget for a cheap step, which the four-times floor makes 60s', () => {
    expect(driftReport([{ name: 'packages:check', declared: 5, measured: 21 }], 3, 3, false))
      .toContain('5s -> 21s  (killed at 60s)');
  });

  it('keeps an overrun out of the count when the run could answer for both directions', () => {
    // forced: the run did all the work, so both directions are reportable and the record form is right
    expect(driftReport([{ name: 'typecheck', declared: 27, measured: 61 }], 3, 3, true))
      .toContain('re-measure, or record');
  });

  it('says nothing when nothing drifted, at either lane count', () => {
    expect(driftReport([], 3, 3, true)).toBe('');
    expect(driftReport([], 1, 3, true)).toBe('');
  });
});

describe('shouldClassify', () => {
  const under = { lanes: 3, exclusive: false, timedOut: false, optedOut: false };

  it('re-runs a step that failed while others were running', () => {
    expect(shouldClassify(under)).toBe(true);
  });

  it('does not, when there was nothing to contend with', () => {
    // One lane: the step already had the machine
    expect(shouldClassify({ ...under, lanes: 1 })).toBe(false);
    // packages:ensure and packages:check run with nothing beside them whatever the lane count
    expect(shouldClassify({ ...under, exclusive: true })).toBe(false);
  });

  it('does not re-run a step that was killed, whose budget it would spend again', () => {
    expect(shouldClassify({ ...under, timedOut: true })).toBe(false);
  });

  it('does not when asked not to', () => {
    expect(shouldClassify({ ...under, optedOut: true })).toBe(false);
  });
});

describe('classifyLine', () => {
  /**
   * The dangerous output. A reader skimming a failing run must not take this for the chain being fine, so the
   * sentence says the chain fails; the exit code stays 1, and the retry writes no stamp, in chain.ts.
   */
  it('says the chain still fails when the step passed alone', () => {
    const line = classifyLine({ code: 0, ms: 47_200 });

    expect(line).toContain('passed in 47.2s');
    expect(line).toContain('contention or a flake, not the code');
    expect(line).toContain('The chain still fails.');
  });

  it('says the failure is real when it failed alone too', () => {
    expect(classifyLine({ code: 1, ms: 48_100 })).toContain('failed again (exit 1) in 48.1s — the failure is real.');
  });

  it('distinguishes a step that was wedged from one that was crowded', () => {
    expect(classifyLine({ code: 1, ms: 240_000, timedOut: true })).toContain('wedged, not crowded');
  });
});

describe('howLong, once the chain answers the question itself', () => {
  it('stops suggesting the run it is about to make', () => {
    const slow = { seconds: 27 };

    expect(howLong(slow, 61_000, 3, false)).toContain('--lanes 1');
    expect(howLong(slow, 61_000, 3, true)).not.toContain('--lanes 1');
    // and still says what it cost, which is the half that does not become redundant
    expect(howLong(slow, 61_000, 3, true)).toContain('against 27s healthy at 3 lanes');
  });
});
