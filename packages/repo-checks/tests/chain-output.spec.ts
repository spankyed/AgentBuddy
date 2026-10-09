// How a chain run puts a step on a line. The chain's own file runs the chain on import, so the formatting lives
// in `scripts/lib/chain-output.ts` where a spec can reach it without starting a six-minute build.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstChange, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, orderedSteps } from '../../../scripts/lib/chain-steps.ts';
import { machineText, thisMachine } from '../../../scripts/lib/core-budget.ts';
import { briefly, classifyLine, criticalPathLine, pathSavingsLine, outgrownReport, declaredAt, dim, driftReport, DRY_REASON_COLUMN, howLong, identicalRewrites, marker, movedWhileItRan, oneLine, REASON_COLUMN, shouldClassify, staleLines, STEP_NAME_WIDTH, TIME_COLUMN, voidedLine, whenChanged, wrapAt, writerOf } from '../../../scripts/lib/chain-output.ts';

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
    expect(writerOf('packages/demo-pack/generated/library.content.json', steps)).toBe('compile');
  });

  /** Nobody's output is the interesting answer: an undeclared write is the one there is something to do about */
  it('answers nothing for a file no step declares', () => {
    expect(writerOf('tests/packs/probe.txt', steps)).toBeUndefined();
  });
});

/**
 * Which of `whenChanged`'s four readings voids a step's pass. Only one does, and the three that do not are
 * each a reason the chain must stay green: an ordinary cache miss, a change that cannot be placed, and a
 * stamp with no brackets to place it against. A chain that went red for any of them would go red for an edit
 * made deliberately while a long run finished, which is how a report gets ignored.
 *
 * The cases iterate every reading rather than naming the one that fires, so a fifth could not arrive
 * unwatched — `whenChanged`'s return type is the population.
 */
describe('movedWhileItRan', () => {
  const readings = ['while it ran', 'since it ran', 'though its mtime predates the run', ''] as const;

  it('voids a pass only for a change inside the run', () => {
    const voided = readings.filter((when) => movedWhileItRan([{ when }]));

    expect(voided, 'the other three are reasons not to fail, not weaker versions of the same one').toEqual(['while it ran']);
  });

  it('finds one among several, since a step reads more than one file', () => {
    expect(movedWhileItRan([{ when: 'since it ran' }, { when: '' }, { when: 'while it ran' }])).toBe(true);
    expect(movedWhileItRan([{ when: 'since it ran' }, { when: '' }])).toBe(false);
  });

  // A declared-set change has no files at all, so there is nothing to place and nothing to void
  it('says nothing is voided when no file moved', () => {
    expect(movedWhileItRan([])).toBe(false);
  });
});

/**
 * The line those steps get. **Printed whether or not `--strict` is on**, which is the whole of what the flag
 * gates: a reader who is told only "will not be cached next run" reads the step's `ok` as a pass, and it was
 * not one. The flag decides whether the chain stops a merge, not whether the reader is told.
 */
describe('voidedLine', () => {
  it('names the step and says its result does not describe this tree', () => {
    const line = voidedLine(['typecheck'], false);

    expect(line).toContain("typecheck's result does not describe this tree");
    expect(line, 'read, not written — the step is the victim here, not the culprit').toContain('it read files that changed while it ran');
  });

  it('offers the flag when it is off, and does not when it is on', () => {
    expect(voidedLine(['typecheck'], false)).toContain('--strict fails the run on this.');
    expect(voidedLine(['typecheck'], true), 'it already did').not.toContain('--strict');
  });

  // One defect can void many steps at once: api:check rebuilding @abuddy/testing mid-chain once left twenty
  it('counts them rather than listing twenty names in a sentence', () => {
    const line = voidedLine(['a', 'b', 'c'], true);

    expect(line).toContain("3 steps' results do not describe this tree");
    expect(line).toContain('they read files that changed while they ran');
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
    name: 'typecheck', nameWidth: 'typecheck'.length, gained: [], lost: [], files: [], identical: [], undiffable: undefined, ...found,
  // Matching the control character is the job: the chain's own output is coloured, and this reads it plain.
  // eslint-disable-next-line no-control-regex
  }).map((line) => line.replace(/\u001B\[\d+m/g, '').trimEnd());

  // A step with nothing to name still has to print its own name, or it vanishes from a report about it. Which
  // sentence fills that row is the stamp reader's to say: `diffableStamp` owns the wording, and this used to
  // hold a second copy of one of its sentences — printed, at one call site, about a step that had never run.
  it('prints the reason a stamp could not be read, rather than wording one of its own', () => {
    expect(under({ undiffable: 'has not run yet' })).toEqual(['  typecheck  has not run yet']);
  });

  it('says the inputs agree when there is nothing to name and the stamp was readable', () => {
    expect(under({})).toEqual(['  typecheck  nothing under its inputs differs now']);
  });

  /**
   * The first finding shares the step's row, and the rest sit under it — two lines of screen for the usual case
   * of one step and one file. Each path is padded to the widest this step names, so the qualifiers form a column.
   */
  it('names each file with what happened to it, when, and whose output it is', () => {
    expect(under({ files: [
      { file: 'tests/packs/probe.txt', how: 'changed', when: 'while it ran' },
      { file: 'packages/demo-pack/dist/content.json', how: 'added', when: 'since it ran', writer: 'compile' },
    ] })).toEqual([
        '  typecheck  tests/packs/probe.txt                 changed while it ran',
      "             packages/demo-pack/dist/content.json  added since it ran, compile's declared output",
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
      identical: ['packages/demo-pack/dist/library.content.json', 'packages/demo-pack/dist/notes.content.json'],
    })).toEqual([
      '  typecheck  tests/packs/probe.txt  changed while it ran',
      '             · packages/demo-pack/dist/library.content.json and 1 more — touched during the run, not changed',
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
    const table = ["  // why it is never cached", "  { name: 'test', neverCachedBecause: '…',", '  },'].join('\n');
    expect(declaredAt(table, 'test')).toBe(2);
  });

  /** A rename degrades to no pointer rather than to a wrong one, which is why the caller takes `undefined` */
  it('answers nothing for a name the table does not hold', () => {
    expect(declaredAt("  { name: 'test' },", 'compile')).toBeUndefined();
  });

  /**
   * A generated name is matched by prefix, and a prefix match is not a lookup — so these two cases are the
   * ones that say the answer is the step's own declaration rather than the first line that could pass for it.
   * Written tables, because the real one holds a single template and so cannot exercise either: the hazard is
   * a second generator arriving, which is exactly when nobody will be looking here.
   */
  it('points at the most specific generator, not the first one that prefixes the name', () => {
    const table = ['  { name: `test:${kind}`,', '  { name: `test:unit:${kind}`,'].join('\n');
    expect(declaredAt(table, 'test:unit:host'), 'the wider prefix answered for a name the narrower one generates').toBe(2);
    expect(declaredAt(table, 'test:smoke'), 'and the wider one still answers for what only it generates').toBe(1);
  });

  it('answers nothing when two generators are equally specific', () => {
    const table = ['  { name: `test:${kind}`,', '  { name: `test:${other}`,'].join('\n');
    expect(declaredAt(table, 'test:unit:host'), 'a pointer at one of two equal candidates is a guess').toBeUndefined();
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
  const neverCached = CHAIN_STEPS.filter((step) => step.neverCachedBecause !== undefined);
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
  // Built the way chain.ts builds them, so a change to either shape fails here rather than on a terminal.
  // `marker` is the width, not a literal: both of its answers must be one width or every row below a
  // marked step shifts, which is the whole failure these columns exist to prevent.
  expect(marker(true).length, 'the marker is not one width').toBe(marker(false).length);
  const mark = marker(true);
  expect(`${'ok'.padStart(7)} ${mark} ${name} ${'26.1s'.padStart(6)}  `.length, "a run row's reason").toBe(REASON_COLUMN);
  expect(`${'run'.padStart(7)} ${mark} ${name} `.length, "a --dry row's reason").toBe(DRY_REASON_COLUMN);
  expect(`${'ok'.padStart(7)} ${mark} ${name} `.length, "a run row's time").toBe(TIME_COLUMN);
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
  it('says what it cost against what it costs healthy, and on what budget', () => {
    expect(howLong({ seconds: 60 }, 47_000, 10)).toBe(' after 47.0s, against 60s healthy on a 10-core budget');
  });

  it('names one core as a core rather than a budget of one', () => {
    expect(howLong({ seconds: 60 }, 47_000, 1)).toContain('healthy on 1 core');
    expect(howLong({ seconds: 60 }, 47_000, 1)).not.toContain('budget');
  });

  it('points at a serial run only when the step was slow enough for contention to explain it', () => {
    // Past double the declared cost, which is `driftedSteps`' band rather than a second threshold
    expect(howLong({ seconds: 60 }, 130_000, 10)).toContain('--cores 1');
    // A step that failed at its normal speed failed on its merits, and suggesting a re-run would be noise
    expect(howLong({ seconds: 60 }, 61_000, 10)).not.toContain('--cores 1');
  });

  it('says nothing for a step that declares no cost, rather than reporting undefined', () => {
    expect(howLong({}, 47_000, 10)).toBe('');
  });
});

/** The machine the table was measured on, and two live ones: the same box, and another with the same cores */
const MEASURED = { cpu: 'Apple M1 Pro', cores: 10 } as const;
const SAME = MEASURED;
const OTHER_CORES = { cpu: 'Apple M1 Pro', cores: 20 } as const;
const OTHER_CPU = { cpu: 'Apple M4 Pro', cores: 10 } as const;

describe('driftReport', () => {
  const drifted = [
    { name: 'test:external-pack:contract', declared: 57, measured: 18, peers: 0 },
    { name: 'typecheck', declared: 27, measured: 11, peers: 0 },
  ];

  // The same label on the drift rows, for the same reason: both reports put a measurement beside the table
  it('says how contended each drift reading was', () => {
    const report = driftReport(drifted.map((row) => ({ ...row, peers: 4 })), 10, MEASURED, true, SAME);

    expect(report).toContain('(4 peers)');
  });

  it('prints the edit to make, when the run is comparable to the table', () => {
    const report = driftReport(drifted, 10, MEASURED, true, SAME);

    expect(report).toContain('edit the declaration to match');
    expect(report).toContain('seconds: 57 -> 18');
  });

  /**
   * **The advice is what the schedule gates; the numbers are not.**
   *
   * `seconds` is declared, so the remedy is an edit and an edit is followable anywhere — but the *number*
   * to write is only true of the schedule the table describes, so offering one off that schedule offers a
   * value that would be wrong the moment it landed. A chain on a second developer's machine printed the
   * instruction on every run against numbers taken on different silicon.
   *
   * The box is the second number, not a nicety: `budget === measuredAt` alone passes `--cores 10` on a
   * twenty-core machine, where the budget matches and every width is twenty-core sized. That is the hole
   * `isMeasuredSchedule` was written for, and this is the case that holds this caller to it.
   */
  it('prints the numbers but no instruction on a machine the table does not describe', () => {
    const report = driftReport(drifted, 10, MEASURED, true, OTHER_CORES);

    expect(report, 'what a step cost is true wherever it ran').toContain('57s -> 18s');
    expect(report, 'the number to write is not true there, so no edit is offered')
      .not.toContain('edit the declaration');
  });

  it('gates on the machine as well as the budget, which a budget alone cannot', () => {
    // Same budget, same measured schedule, different machine — the one combination the weaker guard missed
    expect(driftReport(drifted, 10, MEASURED, true, SAME)).toContain('edit the declaration to match');
    expect(driftReport(drifted, 10, MEASURED, true, OTHER_CORES)).not.toContain('edit the declaration to match');
  });

  /**
   * And on the CPU as well as the core count, which is the hole a core count alone leaves.
   *
   * Keyed on cores only, every 10-core machine read as the one the table was measured on — an M4 Pro, a
   * 10-core Xeon, any of them. A second developer on a 10-core Mac, the commonest shape there is, got this
   * instruction on a table measured on different silicon, naming a number that did not describe it.
   */
  it('prints no instruction on another machine with the same core count', () => {
    expect(driftReport(drifted, 10, MEASURED, true, OTHER_CPU), 'same cores, different CPU')
      .not.toContain('edit the declaration to match');
    expect(driftReport(drifted, 10, MEASURED, true, OTHER_CPU), 'the numbers are still true there')
      .toContain('57s -> 18s');
  });

  /**
   * Measured: a serial run reports exactly these two, and the old report told the reader to record 18 for a
   * step that costs 57s in the default schedule — which `budgetFor` turns into a 72s kill budget, the
   * mis-sized bound `seconds`' own doc warns about. The numbers are real; only "record them" was wrong.
   */
  it('names the spread instead, when the run used another budget', () => {
    const report = driftReport(drifted, 1, MEASURED, true, SAME);

    expect(report).not.toContain('record');
    expect(report).toContain('on 1 core, 2 steps moved against 10-core numbers');
    expect(report).toContain('57s -> 18s  (3.2x faster alone)');
  });

  it('says slower when a bigger budget made a step slower, not faster', () => {
    expect(driftReport([{ name: 'typecheck', declared: 27, measured: 54, peers: 0 }], 16, MEASURED, true, SAME)).toContain('(2.0x slower)');
  });

  /**
   * Measured: a gate run with nine of twelve steps cached reported `typecheck seconds: 27 -> 12`. A full
   * budget with almost everything cached is no contention at all, so the step ran at its solo speed and the
   * admission policy — which is what the first version of this gated on — said nothing about it.
   */
  it('says nothing about a step that came in under the band, on a run that did less work', () => {
    expect(driftReport(drifted, 10, MEASURED, false, SAME)).toBe('');
    expect(driftReport(drifted, 1, MEASURED, false, SAME)).toBe('');
  });

  /**
   * The other direction is not the run's doing: less contention cannot make a step slower, so an overrun on a
   * partial run is the step growing, which is why this one is reported whatever the run did. Measured over 40
   * step runs in a day: 6 under the band, 0 over it, so saying it always costs no noise.
   *
   * **It named `(killed at 108s)` until 2026-10-03, and a sibling case covered the floor that made a cheap
   * step's real budget 60s rather than four times its cost.** Both went with `budgetFor`: a deadline is a
   * declared class now (`step-timeouts.ts`), so it is not a function of the declared cost and this row has
   * no way to compute one — and nothing to gain by being handed the class, which is the same number for
   * every step in it and is in the timeout message already. Do not put a predicted deadline back here
   * without first giving the row something the timeout message does not already say.
   */
  it('names a step that ran past double, on any run', () => {
    const grew = [{ name: 'typecheck', declared: 27, measured: 61, peers: 0 }];

    const report = driftReport(grew, 10, MEASURED, false, SAME);

    expect(report).toContain('the step grew, not the schedule');
    expect(report).toContain('27s -> 61s');
    expect(report, 'a deadline is a class, so this row cannot predict one').not.toContain('killed at');
  });

  it('keeps an overrun out of the count when the run could answer for both directions', () => {
    // forced: the run did all the work, so both directions are reportable and the edit form is right
    expect(driftReport([{ name: 'typecheck', declared: 27, measured: 61, peers: 0 }], 10, MEASURED, true, SAME))
      .toContain('edit the declaration to match');
  });

  it('says nothing when nothing drifted, at either budget', () => {
    expect(driftReport([], 10, MEASURED, true, SAME)).toBe('');
    expect(driftReport([], 1, MEASURED, true, SAME)).toBe('');
  });

  /**
   * **What the recorder's idle floor used to decide, said to the reader who now decides it.**
   *
   * Nothing refuses a run any more, so the way a stale number gets in is somebody reading a drift off a
   * loaded box and typing it. These cases hold the two facts that stop that — how quiet the machine was,
   * and whether the rows moved together — and, more importantly, hold the verdict to the cases where it is
   * actually true. A report that says "this reads as the box" when it does not is the only way this lies.
   */
  const QUIET = { idle: 0.88, comparable: 30 };
  const slowerBy = (over: number) => [{ name: 'compile', declared: 24, measured: 24 + over, peers: 0 }];

  it('carries the reading and the count, so a figure is not copied blind', () => {
    const report = driftReport(drifted, 10, MEASURED, true, SAME, QUIET);

    expect(report).toContain('2 of 30 comparable steps');
    expect(report).toContain('88% idle');
  });

  it('says nothing of conditions when it was told none, which is how every other caller reads', () => {
    expect(driftReport(drifted, 10, MEASURED, true, SAME)).not.toContain('comparable steps');
  });

  it('names the box and the remedy below the floor measure refuses at', () => {
    const report = driftReport(drifted, 10, MEASURED, true, SAME, { idle: 0.42, comparable: 30 });

    expect(report, 'under IDLE_FLOOR, so the figure may be the machine').toContain('may be the');
    expect(driftReport(drifted, 10, MEASURED, true, SAME, QUIET), 'and not above it')
      .not.toContain('may be the');
  });

  /**
   * The direction is the whole of it: load inflates a duration and cannot deflate one, so rows that all came
   * in slower may be the box, and rows that all came in faster cannot be — that is the table being stale,
   * which is what `build:app` declared at 39s against a real 13s was.
   */
  it('reads rows that all came in slower as the box', () => {
    const report = driftReport([...slowerBy(40), { name: 'typecheck', declared: 27, measured: 61, peers: 0 }],
      10, MEASURED, true, SAME, QUIET);

    expect(report).toContain('read the box before the code');
  });

  it('reads rows that all came in faster as the table, since load cannot cause it', () => {
    expect(driftReport(drifted, 10, MEASURED, true, SAME, QUIET))
      .toContain('this is the table and not the run');
  });

  // Mutation: drop the `shown.length > 1` clause and this fails — one step carrying a drift is that step's
  // business, and the rows are printed, so a reader sees concentration without the report asserting it
  it('calls one row neither, however far it moved', () => {
    const report = driftReport(slowerBy(200), 10, MEASURED, true, SAME, QUIET);

    expect(report).toContain('1 of 30 comparable steps');
    expect(report).not.toContain('read the box before the code');
    expect(report).not.toContain('this is the table and not the run');
  });

  it('calls rows that moved both ways neither, since they tell no single story', () => {
    const report = driftReport([...slowerBy(40), ...drifted], 10, MEASURED, true, SAME, QUIET);

    expect(report).not.toContain('read the box before the code');
    expect(report).not.toContain('this is the table and not the run');
  });
});

describe('shouldClassify', () => {
  const under = { ranAlone: false, timedOut: false, optedOut: false };

  it('re-runs a step that failed while others were running', () => {
    expect(shouldClassify(under)).toBe(true);
  });

  // One question, asked of the schedule rather than of the table. It took a lane count and an `exclusive` read off
  // the step's declared mutexes, and those answered it only while a mutex was global: `conflictsOf` is
  // non-empty for twelve steps that run beside two dozen others, so all twelve skipped the re-run. A
  // serial run needs no clause of its own — it overlaps nothing, which is this one
  it('does not, when nothing overlapped it', () => {
    expect(shouldClassify({ ...under, ranAlone: true })).toBe(false);
  });

  it('does not re-run a step that was killed, whose budget it would spend again', () => {
    expect(shouldClassify({ ...under, timedOut: true })).toBe(false);
  });

  it('does not when asked not to', () => {
    expect(shouldClassify({ ...under, optedOut: true })).toBe(false);
  });
});

/**
 * What a run says when a step's *measured* cost has outgrown the rung it declares.
 *
 * The bound (`declaredShare`) reads the declaration, and the band watching declarations is half-to-double — so
 * a step can pass the bound while its real cost has outgrown it. `outgrownRungs` finds those; this words them.
 *
 * **It is a report, so what it must not do is read like a failure**, and what it must do is hand the reader
 * something proportionate to the question. The thing that would make it a false alarm is a crowded run, and
 * the instrument that settles that is the step's own command under `measure`, which refuses a busy box — so
 * that is what it leads with. It led with `chain --all --cores 1` instead until 2026-10-07, which spent all
 * thirty steps to answer about one and still produced a single ungated observation; both times it fired,
 * the step turned out not to have grown.
 */
describe('outgrownReport', () => {
  const found = [{
    name: 'test:integration', declared: 60, measured: 80, at: 80 * 4 / 300,
    measureWith: 'npx vitest run --config vitest.integration.config.ts', wholeTable: true, peers: 0,
  }];

  /**
   * How contended the reading was, which is the one thing the two numbers cannot say.
   *
   * `seconds` is the cost under the chain's own admission, so a reading taken beside peers is the right
   * quantity — what a reader cannot tell from `60s -> 101s` is which admission produced it.
   * `test:integration` read 77s, 88s, 96s and 101s across four runs of an unchanged step, and the spread is
   * this number. A spread nothing explains is how a true row comes to be ignored, which is what happened.
   */
  it('says how many peers the reading was taken beside', () => {
    const contended = found.map((row) => ({ ...row, peers: 9 }));

    expect(outgrownReport(contended)).toContain('(9 peers)');
  });

  // Said rather than left blank: "alone" is the reading a budget can be compared against, so it is the
  // case worth naming, and an empty suffix would read as a report that forgot to say
  it('says a step had the box to itself, rather than saying nothing', () => {
    expect(outgrownReport(found)).toContain('(alone)');
  });

  it('says nothing when no step outgrew its rung', () => {
    expect(outgrownReport([])).toBe('');
  });

  it('names both numbers, the share and the rung it is a share of', () => {
    const said = outgrownReport(found);

    expect(said, 'what it cost').toContain('80s');
    expect(said, 'against what it declares').toContain('60s');
    expect(said, 'and where that lands').toContain('107%');
  });

  /**
   * The cheap check first, because it is the one a reader can act on at once and the one that ends the
   * question most often. It carries the step's *own* command, so the advice measures the thing reported
   * rather than the chain around it.
   */
  it("leads with measure over the step's own command", () => {
    const said = outgrownReport(found);

    expect(said).toContain('npm run measure -- "npx vitest run --config vitest.integration.config.ts"');
    expect(said.indexOf('npm run measure'), 'before the serial chain, not after it')
      .toBeLessThan(said.indexOf('--all --cores 1'));
  });

  // One command per step, or a reader with two reported steps measures whichever the report happened to name
  it('names a command for each step it reports', () => {
    const said = outgrownReport([
      ...found,
      {
        name: 'build:app', declared: 39, measured: 90, at: 90 * 4 / 300,
        measureWith: 'npm run build:app', wholeTable: true, peers: 0,
      },
    ]);

    expect(said).toContain('npm run measure -- "npx vitest run --config vitest.integration.config.ts"');
    expect(said).toContain('npm run measure -- "npm run build:app"');
  });

  it('still names the serial run, for the question measure cannot answer', () => {
    // Whether the *schedule* changed is a different question from whether the step did, and the serial chain
    // is the only thing that answers it — so it stays, below the cheap check rather than instead of it
    expect(outgrownReport(found)).toContain('--all --cores 1');
  });

  it('asks for --all with it, since a step it reported has passed and is stamped', () => {
    // A plain `--cores 1` re-run finds the step cached and measures nothing, which is advice that cannot be
    // taken — `driftReport`'s doc draws the same distinction from the other side. Asserted as the bad
    // spelling rather than as "no bare --cores", which the good spelling contains
    expect(outgrownReport(found)).not.toContain('chain -- --cores 1');
  });

  it('asks for the declaration rather than the rung, since the declaration moves first', () => {
    // The pipeline: report, then edit `seconds`, then `chain-graph` fails on the new declaration, then the
    // step moves. Telling a reader to move the rung first skips the step that proves it needs moving
    expect(outgrownReport(found)).toContain('edit the cost it declares');
  });

  /**
   * **The one comparability condition this report skips, said rather than left out.** The table is
   * written only under `--all`, so a partial run's reading is an upper bound and not a comparison — worth
   * printing with that caveat, which is the difference between a report and a finding.
   */
  it('says a partial run is an upper bound, and says nothing of the sort for --all', () => {
    const partial = outgrownReport(found.map((row) => ({ ...row, wholeTable: false })));

    expect(partial).toContain('upper bound');
    expect(partial, 'and what that buys the reader').toContain('cannot convict');
    expect(outgrownReport(found), 'an --all run is the schedule the table describes')
      .not.toContain('upper bound');
  });

  // Once for the run, not once per row: every row of one run shares the condition
  it('says it once however many steps it names', () => {
    const said = outgrownReport([
      ...found.map((row) => ({ ...row, wholeTable: false })),
      {
        name: 'build:app', declared: 39, measured: 90, at: 90 * 4 / 300,
        measureWith: 'npm run build:app', wholeTable: false, peers: 0,
      },
    ]);

    expect(said.split('upper bound').length - 1).toBe(1);
  });
});

describe('classifyLine', () => {
  const HERE = thisMachine();
  const SMALLER = { cpu: 'Some Smaller CPU', cores: 4 };

  /**
   * The dangerous output. A reader skimming a failing run must not take this for the chain being fine, so the
   * sentence says the chain fails; the exit code stays 1, and the retry writes no stamp, in chain.ts.
   */
  it('says the chain still fails when the step passed alone', () => {
    const line = classifyLine({ code: 0, ms: 47_200 }, HERE);

    expect(line).toContain('passed in 47.2s');
    expect(line).toContain('The chain still fails.');
  });

  /**
   * The conclusion it used to draw, and the reason it could not. Running alone rules the *code* out — the same
   * command over the same tree — and rules nothing else out, so "contention or a flake" picked between two
   * possibilities over a variable the message had never identified. It cost two wrong hypotheses on 2026-10-07.
   *
   * The same `.not.toContain(<the conclusion>)` + `.toContain(<the hedge>)` pair the timeout arm below uses.
   */
  it('claims no cause, naming what it ruled out and what it did not', () => {
    const line = classifyLine({ code: 0, ms: 47_200 }, HERE, ['test:unit:host']);

    expect(line, 'the verdict it has no evidence for').not.toContain('contention or a flake');
    expect(line, 'the half the re-run did establish').toContain('the code is ruled out, and nothing else is');
    expect(line, 'and that it cannot choose between what is left').toContain('neither does this message');
  });

  // What the schedule recorded, rather than what the budget permitted — which is why this was a guess before
  it('names the steps that actually ran beside it', () => {
    const line = classifyLine({ code: 0, ms: 1_000 }, HERE, ['lint:check', 'typecheck:fe']);

    expect(line).toContain('It ran beside lint:check, typecheck:fe the first time.');
  });

  it('counts the rest rather than listing a whole schedule', () => {
    const line = classifyLine({ code: 0, ms: 1_000 }, HERE, ['a', 'b', 'c', 'd', 'e']);

    expect(line).toContain('beside a, b, c and 2 others the first time');
  });

  /**
   * A step that failed while already alone is not re-run (`shouldClassify`), so an empty set reaching here is
   * the harness's case rather than the chain's — and it must still read as a sentence rather than trailing off.
   */
  it('says so when nothing ran beside it', () => {
    const line = classifyLine({ code: 0, ms: 1_000 }, HERE, []);

    expect(line).toContain('nothing here was beside it');
    expect(line, 'and still refuses the verdict').toContain('neither does this message');
  });

  it('says the failure is real when it failed alone too', () => {
    expect(classifyLine({ code: 1, ms: 48_100 }, HERE)).toContain('failed again (exit 1) in 48.1s — the failure is real.');
  });

  it('distinguishes a step that was wedged from one that was crowded', () => {
    expect(classifyLine({ code: 1, ms: 240_000, timedOut: true }, HERE)).toContain('wedged, not crowded');
  });

  /**
   * And off that machine it claims only the half the re-run established.
   *
   * Running alone rules out contention wherever it runs; "wedged" needs the deadline to be generous here, and
   * a deadline is a class sized for a machine this one may be smaller than. The flat version was the last
   * ungated timeout verdict in the repo after `timedOutBecause` gated its arms — two of three at first, and
   * the third once the machine stopped being bundled with a cost that an arm might not have.
   */
  it('claims only "not crowded" on a machine the deadline was not sized for', () => {
    const line = classifyLine({ code: 1, ms: 240_000, timedOut: true }, SMALLER);

    expect(line, 'the conclusion the retry cannot reach here').not.toContain('wedged, not crowded');
    expect(line).toContain('not crowded, which is all this says');
    expect(line, 'both machines, so the reader can see why').toContain(machineText(SMALLER));
    expect(line).toContain(machineText(HERE));
  });
});

describe('howLong, once the chain answers the question itself', () => {
  it('stops suggesting the run it is about to make', () => {
    const slow = { seconds: 27 };

    expect(howLong(slow, 61_000, 10, false)).toContain('--cores 1');
    expect(howLong(slow, 61_000, 10, true)).not.toContain('--cores 1');
    // and still says what it cost, which is the half that does not become redundant
    expect(howLong(slow, 61_000, 10, true)).toContain('against 27s healthy on a 10-core budget');
  });
});

/**
 * The line that answers "which step is worth making faster".
 *
 * It exists because a step's own duration does not answer it: the chain admits steps in parallel, so one
 * off the critical path runs inside the shadow of the ones on it and halving it saves nothing. Learned on
 * 2026-10-06 against `test:unit:pack`, which is 89% setup overhead — the worst-looking number in the suite,
 * and off the path, so the work would have bought no wall clock.
 */
describe('criticalPathLine', () => {
  /** A → B → C at 10s each, with D hanging off A, so the path is unambiguous and D is not on it */
  const chain = [
    { name: 'a', seconds: 10, dependsOn: [] },
    { name: 'b', seconds: 10, dependsOn: ['a'] },
    { name: 'c', seconds: 10, dependsOn: ['b'] },
    { name: 'd', seconds: 99, dependsOn: ['a'] },
  ];

  it('names the longest chain and what it declares, in order', () => {
    expect(criticalPathLine(chain, 'declared'))
      .toBe('critical path 109s declared (a -> d)');
  });

  // Measured wears no label, because the figure is the run's own rather than the table's
  it('says declared only of the table', () => {
    expect(criticalPathLine(chain, 'measured')).toBe('critical path 109s (a -> d)');
  });

  /**
   * **A need outside the list contributes nothing**, which is what makes the plan's path meaningful.
   *
   * `--dry` passes only the steps that would run, so a cached dependency has to count as free — it costs
   * this run nothing. Without that the plan would report a path through work it is going to skip.
   */
  it('counts only the steps it was given, so a cached dependency is free', () => {
    const planned = chain.filter((step) => step.name === 'b' || step.name === 'c');
    expect(criticalPathLine(planned, 'declared'), "a's 10s is not this run's")
      .toBe('critical path 20s declared (b -> c)');
  });

  it('says nothing of a path of one, where the step is its own line already', () => {
    expect(criticalPathLine([chain[0]!], 'declared')).toBe('');
    expect(criticalPathLine([], 'declared')).toBe('');
  });

  /**
   * And over the real table it names a path, so the line a dry run prints is not an artefact of a fixture.
   *
   * Asserted as a shape rather than a value: the names and the total are the declared table's and move with
   * it, where what must hold is that the chain has a path at all and that it ends at a leaf nothing waits on.
   */
  it('finds a path through the chain this repo actually has', () => {
    const ordered = orderedSteps(CHAIN_STEPS);
    const line = criticalPathLine(ordered, 'declared');
    expect(line, 'the chain is a graph, so it has a longest route through it').toMatch(/^critical path \d+s declared \(.+ -> .+\)$/);
  });
});

/**
 * What shortening a step could buy, which is not what it costs.
 *
 * A step's saving is capped by the second-longest route, so the interesting case — and the one these
 * fixtures are built to show — is a long step worth almost nothing. Three proposals in one day were sized
 * by reading a duration and every one was bounded by a path nobody had computed.
 */
describe('pathSavingsLine', () => {
  /** `a -> b` is the longest route at 100; `c` is an independent route at 85, which is what caps a saving */
  const dense = [
    { name: 'a', seconds: 10, dependsOn: [] },
    { name: 'b', seconds: 90, dependsOn: ['a'] },
    { name: 'c', seconds: 85, dependsOn: [] },
  ];

  it('names each step on the path and what freeing it would buy, largest first', () => {
    expect(pathSavingsLine(dense)).toBe('the most any one can buy: b 15s, a 10s');
  });

  /**
   * The point of the line: `b` is 90 of the 100 and buys 15.
   *
   * Asserted as the relation rather than the number, because that is the claim — a duration is not a
   * saving — where the figures are only this fixture's.
   */
  it('reports a saving far below the duration where another route is close behind', () => {
    const b = dense.find((step) => step.name === 'b')!;
    const buys = Number(/b (\d+)s/.exec(pathSavingsLine(dense))![1]);
    expect(buys).toBeLessThan(b.seconds / 2);
  });

  // And the contrast: with no competing route, a step buys its whole duration — which is why
  // `packages:ensure`, the smallest step on the real path, is the one whose time is fully recoverable
  it('reports the whole duration where nothing else competes', () => {
    const chain = dense.filter((step) => step.name !== 'c');
    expect(pathSavingsLine(chain)).toBe('the most any one can buy: b 90s, a 10s');
  });

  it('names no step that is off the path, since freeing one shortens nothing', () => {
    expect(pathSavingsLine(dense)).not.toContain('c ');
  });

  it('says nothing of a path of one, where the step is its own answer', () => {
    expect(pathSavingsLine([dense[0]!])).toBe('');
    expect(pathSavingsLine([])).toBe('');
  });
});
