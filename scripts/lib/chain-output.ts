/**
 * How a chain run puts a step's line on a terminal.
 *
 * Its own module because the chain's own file runs the chain on import: a spec that wants to check the columns
 * cannot load `chain.ts` without starting a six-minute build.
 */
import { covers } from '@abuddy/host/build/packages-built';
import { isMeasuredMachine, isMeasuredSchedule, machineText, thisMachine, type Machine } from './core-budget.ts';
import { criticalPath, overBand } from './step-timing.ts';
import type { SchedulableStep } from './chain-schedule.ts';

/**
 * How wide a step's name column is, in every row that has one.
 *
 * At least as wide as the longest step name, or `padEnd` does nothing for that one step and every column
 * measured from here is a character short for its row alone. That is not hypothetical: this was 26 against
 * `test:external-pack:contract`'s 27, so all three row shapes put their continuation lines one column left of
 * the reason above them — including the report this number was introduced to line up. A case holds it to the
 * longest name in the table, because the table is where new step names arrive.
 */
export const STEP_NAME_WIDTH = 30;

/**
 * Where each row's reason starts, composed from the one width rather than restated.
 *
 * Every one of these used to be a literal with the arithmetic in a comment beside it, which is how three of
 * them came to disagree with the rows they describe. They are derived now, so widening the name column moves
 * them together and a doc comment cannot go stale against a number it only describes.
 */
export const REASON_COLUMN = STEP_NAME_WIDTH + 21; // verdict(7) ␣ marker(3) ␣ name ␣ time(6) + two spaces

/**
 * The one thing a row says about a step besides its name and its time: whether it needs the built app.
 *
 * Three characters, blank for a step that does not, so the column is a marker rather than a classification
 * — which is what replaced it. `tier` printed `t1`/`t2`/`t3` here, three values no reader could act on,
 * where the one that changes how a run behaves is whether the step waits for `build:app`.
 */
export const marker = (needsApp: boolean): string => (needsApp ? 'app' : '   ');

/** The same, for `--dry`, which reports no time — so its reason starts where the time would have */
export const DRY_REASON_COLUMN = STEP_NAME_WIDTH + 13;

/** The terminal's width, or a width worth wrapping to when the output is a pipe or a CI log */
export const terminalWidth = (): number => process.stdout.columns ?? 100;

/**
 * `text` with its continuation lines indented to `column`, so a reason too long for the row reads as part of it.
 *
 * Without this a reason wraps to column 0, where it looks like another step's line and pulls the eye off the
 * columns above and below — which is what `packages:ensure`'s hundred-and-eighty-character reason did to every
 * run that printed it.
 *
 * Words are kept whole; one longer than the room available takes its own line rather than being cut, because a
 * truncated path or flag is worse than a ragged edge.
 */
export function wrapAt(column: number, text: string, width = terminalWidth()): string {
  const room = Math.max(20, width - column);
  if (text.length <= room) return text;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= room) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join(`\n${' '.repeat(column)}`);
}

/**
 * The line where a step is declared, for a run that wants to point at the reasoning rather than repeat it.
 *
 * A step's name is unique in the table, so the first line naming it is its declaration — and a reader who lands
 * there has the `neverCachedBecause` sentence and, above it, the comment that argues for it, which is where the
 * rationale actually lives. Undefined when the name is not found, so a rename degrades to no pointer rather than
 * to a wrong one.
 *
 * **Two steps are not written out, they are generated**, with a template-literal name — so a search for the
 * quoted form misses them and the right answer is the generator, which is where their reasoning sits anyway.
 * Hence the second pass: a `name: ` whose backtick-quoted prefix this step's name starts with.
 *
 * **That pass takes the longest matching prefix, and refuses a tie.** A prefix match is not a lookup: a second
 * generator writing `` name: `test:${…}` `` would prefix every `test:*` step, and first-match would then point
 * `test:unit:host` at it with the same confidence as at its own template. Most specific wins, as Node matches a
 * subpath pattern; two equally specific candidates are ambiguous and answer nothing, because a caller that
 * takes `undefined` prints no pointer, which is the better of the two wrong answers. Only one template exists
 * today, so the case that watches this is a written table in `chain-output.spec.ts` rather than the real one.
 */
export function declaredAt(source: string, name: string): number | undefined {
  const lines = source.split('\n');
  const written = lines.findIndex((line) => line.includes(`name: '${name}'`));
  if (written !== -1) return written + 1;
  let best: { at: number; prefix: string } | undefined;
  let ambiguous = false;
  for (const [at, line] of lines.entries()) {
    const prefix = /name: `([^$`]*)/.exec(line)?.[1];
    if (prefix === undefined || prefix.length === 0 || !name.startsWith(prefix)) continue;
    if (best === undefined || prefix.length > best.prefix.length) {
      best = { at, prefix };
      ambiguous = false;
    } else if (prefix.length === best.prefix.length) {
      ambiguous = true;
    }
  }
  return best === undefined || ambiguous ? undefined : best.at + 1;
}

/**
 * What a run says about why a step ran, against what `--dry` says.
 *
 * A step that is never cached carries a sentence explaining the design choice, and that sentence is the same on
 * every run — the longest text on the screen and the least specific to the run in front of you. So a run reports
 * the verdict and *where the reasoning is*, `--dry` prints it in full, and the argument itself stays in the
 * comment above the step, which is the only copy of it.
 */
export const briefly = (reason: string, where?: string): string =>
  (reason.startsWith('never cached:')
    ? `never cached${where === undefined ? '' : ` — ${where}`}`
    : reason);

/**
 * `text` cut to the room left on its line, with an ellipsis where it was cut.
 *
 * For a list whose job is to be scanned — the slowest tests in a suite, so the next person profiling it has them
 * without instrumenting anything. Wrapping those keeps every word and costs three lines each on a narrow
 * terminal, which buries the run; the name that identifies a test is at its front, and its whole name is in the
 * suite's own output.
 */
export function oneLine(column: number, text: string, width = terminalWidth()): string {
  const room = Math.max(20, width - column);
  return text.length <= room ? text : `${text.slice(0, room - 1).trimEnd()}…`;
}

/**
 * Where a step's time ends, so a line beneath it can put a time in the same column.
 *
 * The same number as `DRY_REASON_COLUMN` and not the same thing: both sit immediately after the name, one
 * holding a time and one a reason. Derived separately so that stays true if either row changes.
 */
export const TIME_COLUMN = STEP_NAME_WIDTH + 13;

/**
 * Secondary text, dimmed on a terminal and left alone anywhere else.
 *
 * What a run is *for* is the steps that ran: what they cost, and why. The steps that did not, and the slow tests
 * inside the ones that did, are context — worth having on the screen and not worth the same weight as the rows
 * they sit among.
 */
export const dim = (text: string): string => (process.stdout.isTTY ? `\u001B[2m${text}\u001B[22m` : text);

/**
 * The step whose declared `outputs` hold `file`, when one does.
 *
 * A step that passes and is immediately stale was written into while it ran, and the first question is by whom.
 * When the file sits in another step's declared outputs the answer is that step and the fix is an ordering or a
 * narrower input; when it sits in nobody's, the write is undeclared, which is the case the advice is for.
 */
export const writerOf = (
  file: string,
  steps: readonly { readonly name: string; readonly outputs?: readonly string[] }[],
): string | undefined =>
  steps.find((step) => (step.outputs ?? []).some((out) => covers(out, file)))?.name;

/**
 * Where a change sits relative to the run that stamped the inputs — inside it, or after it finished.
 *
 * The two are different problems. Inside means something ran beside this step and wrote where it reads, which is
 * an ordering or a declaration to fix; after means the tree has moved on since, which is usually you. The
 * brackets are the run's own (`takenAt`, `builtAt` on its stamp), so this places a change without the reporter
 * keeping a second reading of when anything started.
 *
 * There is a third answer, and it is the honest one for a case the first two cannot describe: a file whose bytes
 * differ from the stamp but whose mtime predates `takenAt` has not been placed at all, because the stamp recorded
 * that content at `takenAt` and so the timestamp is not telling the truth — something restored it (`cp -p`, an
 * archive, a deliberate `utimes`). Claiming "while it ran" there invents a window the mtime cannot support, which
 * is the same mistake as reading an mtime as a cause: what the file did is known from the digests, and when it
 * did it is not.
 */
export const whenChanged = (
  mtimeMs: number | undefined,
  ranFrom: number | undefined,
  ranUntil: number | undefined,
): '' | 'while it ran' | 'since it ran' | 'though its mtime predates the run' =>
  (mtimeMs === undefined || ranFrom === undefined || ranUntil === undefined ? ''
    : mtimeMs < ranFrom ? 'though its mtime predates the run'
      : mtimeMs <= ranUntil ? 'while it ran' : 'since it ran');

/**
 * The recorded inputs whose bytes did not change and which were written inside the run's own window.
 *
 * Something rewrote them identically — a test that edits a file and puts it back, a build whose emit is
 * deterministic. None of it made the step stale, which is why these are counted rather than named as causes.
 *
 * It can only undercount, and that is a property of mtime rather than a gap to close: mtime records the *last*
 * write, so a file rewritten identically during the run and touched again afterwards is placed after the window
 * and left out. Measured, not reasoned: a rewriter left running past `typecheck`'s window produced exactly that,
 * and the report was right to say nothing. What must never happen is the other direction, a file counted here
 * that did change — and it cannot, because `differing` comes from the digests.
 */
export function identicalRewrites(found: {
  readonly recorded: readonly string[];
  readonly differing: ReadonlySet<string>;
  readonly mtimeOf: (file: string) => number | undefined;
  readonly from: number | undefined;
  readonly until: number | undefined;
}): string[] {
  const { recorded, differing, mtimeOf, from, until } = found;
  if (from === undefined || until === undefined) return [];
  return recorded.filter((file) => !differing.has(file))
    .filter((file) => {
      const mtime = mtimeOf(file);
      return mtime !== undefined && mtime >= from && mtime <= until;
    })
    .sort();
}

/** One input that differs from what the run recorded */
export interface ChangedInput {
  readonly file: string;
  readonly how: 'changed' | 'added' | 'removed';
  /** Whatever `whenChanged` answered, taken from it so a new answer cannot fail to reach the line it prints */
  readonly when: ReturnType<typeof whenChanged>;
  /** The step whose declared `outputs` hold it, from `writerOf` */
  readonly writer?: string;
}


/** How many files a report names before it counts the rest */
export const CHANGED_CAP = 5;

/**
 * What to print under a step that passed and is already stale, given the diff against its own stamp.
 *
 * Every line here is something the stamp can prove. That is the whole change: the list used to be the files
 * whose mtime had moved, which is a superset — it named a compiled seed an E2E test rewrites with the bytes it
 * already had, and the diagnosis that followed was about the wrong file. So a rewrite that changed nothing is no
 * longer a cause; it is a footnote, because a tree being written during every run is worth knowing and is not
 * why anything re-ran.
 *
 * A declared-set change prints instead of files rather than beside them: gaining a watched path makes a unit
 * stale before a byte moves, and a file list for that cause is empty and reads as a contradiction.
 *
 * It renders the whole block, name row included, because the first finding shares that row — a step with one
 * changed file is two lines of screen rather than three, and this report usually names one or two of each. The
 * verdict is not on the row at all: it is the same sentence for every step here (`INPUTS_CHANGED` is the only
 * one a step that just passed can have), so the header says it once and `reason` carries the exception.
 */
export function staleLines(found: {
  readonly name: string;
  /** How wide the name column is, from the names in *this* report rather than the whole table */
  readonly nameWidth: number;
  /** Printed in place of the findings when the verdict is not the ordinary `INPUTS_CHANGED` */
  readonly reason?: string;
  readonly gained: readonly string[];
  readonly lost: readonly string[];
  readonly files: readonly ChangedInput[];
  readonly identical: readonly string[];
  /**
   * Why the stamp could not be diffed, where it could not — the reason its reader gave, never a second copy
   * of one.
   *
   * **Required rather than optional, `undefined` and all.** A caller with nothing to put here is one that has
   * not read the stamp, and the answer this falls back to is "it was readable" — so an omission prints
   * *nothing under its inputs differs now* over a record nobody could read, which is the wrong half of the
   * only two states this row exists for. Optional, that is a field a new caller forgets; required, it is a
   * compile error at the one site that has the answer.
   */
  readonly undiffable: string | undefined;
  readonly cap?: number;
}): string[] {
  const { name, nameWidth, reason, gained, lost, files, identical, undiffable, cap = CHANGED_CAP } = found;
  const head = `  ${name.padEnd(nameWidth)}  `;
  const under = ' '.repeat(head.length);
  const more = (count: number) => (count > cap ? [dim(`and ${count - cap} more`)] : []);
  const shown = files.slice(0, cap);
  // Each path padded to the widest one this step names, so the qualifiers form a column to scan down
  const column = Math.max(0, ...shown.map(({ file }) => file.length));
  const declared = [...gained.map((one) => `+${one}`), ...lost.map((one) => `-${one}`)];

  const rows = reason !== undefined ? [reason]
    : declared.length > 0
      ? [`its declared inputs moved: ${declared.slice(0, cap).join(', ')}`, ...more(declared.length)]
      : [
        // The path is undimmed because it is the thing to act on; when and whose it is are the qualifiers
        ...shown.map(({ file, how, when, writer }) =>
          file.padEnd(column) + dim(`  ${how}${when === '' ? '' : ` ${when}`}${writer === undefined ? '' : `, ${writer}'s declared output`}`)),
        ...more(files.length),
      ];
  // One guard over two states neither of which the chain can produce, kept because the alternative is worse
  // than either: with no rows the step's own name never prints, and it vanishes from a report about it. A
  // stamp that cannot be diffed cannot explain itself, and a stale verdict from a sweep cannot disagree with
  // the diff taken from that same sweep — so if this ever prints, the caller is not the one it was written for.
  //
  // The unreadable half arrives as the message its reader produced rather than being worded again here: that
  // sentence was written out in three files, and the two copies outside `diffableStamp` could drift from it
  // with nothing to notice — this row held one of them.
  if (rows.length === 0) {
    rows.push(dim(undiffable ?? 'nothing under its inputs differs now'));
  }
  if (identical.length > 0) {
    // A note, not another row: it is the one line here that is explicitly not a cause, and it read as one.
    // It names the file, because the name is the whole of what it has to say — a count answers nothing and
    // leaves the reader with the question the note exists to pre-empt, which is the chase it was written after.
    const rest = identical.length - 1;
    // `touched` in its exact sense: the mtime moved and the bytes did not, which is what put this file here
    rows.push(dim(`· ${identical[0]}${rest > 0 ? ` and ${rest} more` : ''} — touched during the run, not changed`));
  }
  return rows.map((row, index) => (index === 0 ? head : under) + row);
}

/**
 * A budget as every message here names it.
 *
 * One spelling, because the two functions below had two: they named the same unit with opposite plural
 * idioms for the same branch (`n > 1 ? 's' : ''` against `n === 1 ? '' : 's'`), which is the shape a third
 * reader copies from whichever they met first.
 */
export const cores = (budget: number): string => (budget === 1 ? '1 core' : `a ${budget}-core budget`);

/**
 * What a failing step cost, against what it costs healthy. The timeout branch below already says this and
 * draws its conclusion; an ordinary failure said only its exit code, which is why one unexplained
 * `test:integration` failure took a reader to `chain-steps.ts` and the deadline by hand to find out it had
 * not been killed — every number needed was already here.
 *
 * Past double the declared cost it names the run that tells the two diagnoses apart, because this repo has
 * measured that they differ: sharing the machine, `@abuddy/cli` "began reporting errors it does not report
 * alone" (the note at the top of this file). The band is `overBand` in step-timing.ts, shared with
 * `driftedSteps` rather than restated — it was restated here once, which is two copies of one rule and how
 * they come apart.
 */
export function howLong(
  step: { readonly seconds?: number },
  ms: number,
  budget: number,
  /** Whether the chain is about to re-run the step alone, in which case suggesting it reads as if no answer followed */
  classifying = false,
): string {
  if (step.seconds === undefined) return '';
  const measured = Math.round(ms / 1000);
  const where = ` after ${(ms / 1000).toFixed(1)}s, against ${step.seconds}s healthy on ${cores(budget)}`;
  return !classifying && overBand(step.seconds, measured)
    ? `${where}\n  — over twice its measured cost; try \`npm run chain -- --cores 1\``
    : where;
}

/**
 * What a drift report means, which depends on the budget the run was given.
 *
 * At `MEASURED_AT_CORES` the numbers are comparable and a drifted step is a stale row, so the value to record
 * is the useful thing to print. At any other budget they are not comparable at all: measured here,
 * `test:external-pack:contract` costs 57s sharing the machine and 18s with it to itself. Printing "record 18"
 * would give a step that takes 57s in the default schedule a 72s kill budget — the mis-sized bound `seconds`'
 * own doc warns about, arrived at by following this tool's advice.
 *
 * The same numbers are worth printing as what they are. Which steps the schedule's contention moves most is not
 * recorded anywhere else. It takes `--all --cores 1` to see it, not the plain `--cores 1` a failing step
 * suggests — that run answers the narrower question the failure asks, whether the step passes alone.
 *
 * **So what the schedule gates is the advice, never the numbers.** Off the measured schedule the rows still
 * print, because what a step cost is true wherever it ran; the sentence telling a reader to record it does
 * not, because `--record` refuses there. A chain on a second developer's machine used to print that
 * instruction on every run and the command it named refused on every run.
 */
/**
 * How contended a reading was, as a suffix — empty for a step that had the box to itself.
 *
 * **It is why one unchanged step reads four different numbers.** `seconds` is the cost under the chain's own
 * admission, so a contended reading is the right quantity rather than a spoiled one; what the number cannot
 * say on its own is which admission it got. `test:integration` read 77s, 88s, 96s and 101s across four runs
 * while costing what its row says, and a spread nothing explains is how a true row comes to be ignored.
 *
 * Both reports take it, because both compare a measurement against the table.
 */
const peerSuffix = (peers: number): string => (peers === 0 ? '  (alone)' : `  (${peers} peers)`);

export function driftReport(
  drifted: readonly { name: string; declared: number; measured: number; peers: number }[],
  budget: number,
  /** The machine and budget the table was measured on (`MEASURED_ON`), which is what a run is comparable to */
  measuredOn: Machine,
  /** Whether the run did every step's work (`--all`), which is how the table's numbers are taken */
  forced: boolean,
  /**
   * This machine, which with `budget` is what says whether the run is the schedule the table describes —
   * `isMeasuredSchedule` has why it takes three facts and not one.
   */
  machine: Machine = thisMachine(),
): string {
  // The two directions are not alike, so a run that cannot answer for one can still answer for the other.
  // Under the band is the run's doing: a smaller budget, or most steps cached, is less contention, and with
  // nine of twelve cached any budget behaves like one. Over it is not — less contention should make a step
  // faster, so an
  // overrun on a partial run is the step growing, which is the direction worth hearing about even though
  // nothing is killed for it any more.
  // Measured over 40 step runs in one day: 6 under the band, 0 over it, so this costs no noise.
  const shown = forced ? drifted : drifted.filter(({ declared, measured }) => overBand(declared, measured));
  if (shown.length === 0) return '';
  const count = `${shown.length} step${shown.length === 1 ? '' : 's'}`;
  const rows = (line: (d: { name: string; declared: number; measured: number }) => string): string =>
    shown.map((d) => `  ${d.name.padEnd(STEP_NAME_WIDTH)} ${line(d)}${peerSuffix(d.peers)}`).join('\n');

  if (!forced) {
    // No `(killed at Ns)` any more, and its absence is the point: a deadline is a declared class now
    // (`step-timeouts.ts`), so it is not a function of the declared cost and cannot be computed from one.
    // Naming the class here would mean threading it through a drift row that has no other use for it, to
    // say a number that is the same for every step in its class and is in the timeout message already.
    return `\n${count} ran past twice the declared cost — the step grew, not the schedule:\n`
      + `${rows(({ declared, measured }) => `${declared}s -> ${measured}s`)}`;
  }
  // **The instruction is what the schedule gates, not the numbers.** `re-measure, or record` is followable
  // only where `--record` would accept the run, and `--record` accepts it only on the measured schedule — so
  // printing it anywhere else is advice whose one command refuses. Asked of `isMeasuredSchedule` rather than
  // of `budget === measuredAt`, which is the weaker form that let `--cores 10` on a twenty-core box through:
  // the budget matched while every width was twenty-core sized.
  if (isMeasuredSchedule(budget, measuredOn, machine)) {
    return `\n${count} cost something other than chain-steps.ts says — re-measure, or record:\n`
      + `${rows(({ declared, measured }) => `seconds: ${declared} -> ${measured}`)}`;
  }
  return `\non ${cores(budget)}, ${count} moved against ${measuredOn.cores}-core numbers`
    + ` — the schedule, not a stale table:\n`
    + `${rows(({ declared, measured }) => {
      const factor = (Math.max(declared, measured) / Math.min(declared, measured)).toFixed(1);
      return `${declared}s -> ${measured}s  (${factor}x ${measured < declared ? 'faster alone' : 'slower'})`;
    })}`;
}

/**
 * Whether a failed step is worth re-running by itself.
 *
 * The chain is the only thing placed to ask whether a failure reproduces: it knows which step failed,
 * and `schedule` drains what is running before it returns, so at that moment the machine is genuinely quiet.
 * The reader can do it too, which is what the suggestion in `howLong` is for — but they have to decide to, and
 * the evidence is gone by the next run.
 */
export function shouldClassify(run: {
  /**
   * Nothing overlapped this step, so running it alone proves nothing — **observed, not predicted**.
   *
   * It was `exclusive`, taken from the step's declared mutexes, which answered a different question the
   * moment those became derived: `conflictsOf` is non-empty for twelve steps that each run beside two
   * dozen others, and all twelve skipped this re-run. `schedule` records what actually overlapped
   * (`ScheduleResult.peers`), and that is the only place the answer exists. The admission limit is gone from
   * the predicate with it: a serial run overlaps nothing, so it is already covered.
   */
  readonly ranAlone: boolean;
  /**
   * A wedged step is not re-run: its deadline is a declared class (`step-timeouts.ts`), so the retry spends
   * that whole class again — five minutes for a `suite` step — to reach a message `classifyLine` can already
   * write from what the first run proved.
   */
  readonly timedOut: boolean;
  readonly optedOut: boolean;
}): boolean {
  return !run.ranAlone && !run.timedOut && !run.optedOut;
}

/**
 * What a run says when a step's measured cost has outgrown the rung it declares.
 *
 * `outgrownRungs` (`step-timing.ts`) has why this exists: the bound reads the declaration, and the band
 * watching declarations is looser than the bound, so a step can pass `declaredShare` while its real cost does
 * not. This is the one place a run can say so, because it is the one place both numbers exist.
 *
 * **Every sentence here is followable, which is what the caller's gate buys.** `outgrownRungs` answers only
 * on the schedule the table was measured on, so both commands below are ones the reader's own box accepts —
 * `--record` refuses any other, and a report whose one instruction refuses is the defect this chain has
 * already shipped twice (`driftReport`'s doc, and the context paragraph in `chain.ts`).
 *
 * **It names what would make it a false alarm**, which a report has to do or it gets ignored: a crowded run
 * inflates a measurement. What it hands the reader to tell that is **the step's own command under
 * `npm run measure`** (`measureCommandFor`, `unit-pool.ts`), for one reason that settles it — `measure`
 * refuses a box under `IDLE_FLOOR` and reports a median over repetitions with its band, so it is the one
 * instrument here that *cannot* hand back the contended number this report is warning about. A median near
 * the declaration ends the question; the remedy below is for when it is not.
 *
 * **It used to prescribe `chain --all --cores 1` and nothing else, and that was the defect.** Settling one
 * step's cost cost all thirty, serially — the sum of the table rather than its 182.4s critical path — and
 * the reading it produced was still a single observation with no idleness gate on it. Measured 2026-10-07:
 * the integration pool read 83s and then 100s in two crowded chain runs, and 47.7s median of 5 (47.6s-48.1s)
 * at 93% idle, against 60s declared and the 48.2s the guide records. Two false alarms, and the instruction
 * for each was ten minutes long. The serial chain is still named, below the cheap answer, because it is the
 * right tool for the other question — whether the *schedule* is what changed — and `--all` stays on it for
 * the original reason: a step that passed is stamped, so a re-run without it finds the step cached and
 * measures nothing.
 *
 * **And it asks for the record, not the rung.** Moving a step to a longer class is the fix, but the
 * declaration moves first: `--all --record` writes what the step costs, `chain-graph.spec.ts` then fails the
 * bound on the new number, and *that* is what says the rung has to change. Advising the rung here would skip
 * the step that proves it.
 */
export const outgrownReport = (
  found: readonly {
    name: string; declared: number; measured: number; at: number; measureWith: string; wholeTable: boolean;
    peers: number;
  }[],
): string => {
  if (found.length === 0) return '';
  const count = `${found.length} step${found.length === 1 ? '' : 's'}`;
  // **The one condition this report skips, said rather than left out.** `outgrownRungs` takes two of the
  // three `RECORDING_CONDITIONS` and reports a partial run anyway, because contention can only make a step
  // slower and so the reading is an upper bound — worth printing with the caveat, not worth printing as a
  // comparison with the table. Said once for the run rather than per row, since every row shares it.
  const partial = found.some(({ wholeTable }) => !wholeTable)
    ? '\n  This run was not --all, which is the only schedule the table describes, so each reading above is\n'
      + '  an upper bound: a crowded run can clear a step and cannot convict one.'
    : '';
  const rows = found.map(({ name, declared, measured, at, peers }) =>
    `  ${name.padEnd(STEP_NAME_WIDTH)} ${declared}s declared, ${measured}s here${peerSuffix(peers)} — ${Math.round(at * 100)}% of `
    + 'its rung on the smaller machine that rung is sized for').join('\n');
  // One line per step, because the command is the step's: a report naming two steps and one command would
  // have a reader measuring whichever it happened to name
  const checks = found.map(({ measureWith }) => `    npm run measure -- "${measureWith}"`).join('\n');
  return `\n${count} cost more than the rung ${found.length === 1 ? 'it declares' : 'they declare'} leaves `
    + `room for:\n${rows}\n`
    + '  A crowded run inflates this, and measure is what cannot be fooled by it — it refuses a busy box and\n'
    + `  reports a median with its band:\n${checks}\n`
    + `  ${found.length === 1 ? 'A median' : 'Medians'} near the declared cost means this run was contention, `
    + 'not growth. If the schedule is the\n'
    + '  suspect instead, `npm run chain -- --all --cores 1` re-runs the table serially; without --all the\n'
    + '  step is cached and the re-run measures nothing.\n'
    + '  If it has really grown, `npm run chain -- --all --record` writes the new cost and\n'
    + '  chain-graph.spec.ts fails the bound on it, which is what says the rung has to change.'
    + partial;
};

/**
 * What the re-run proved.
 *
 * A pass here rules the code out, which is the useful half: the retry runs the same command over the same tree,
 * so anything deterministic in it would fail again. What is left is interference from whatever else was running,
 * or the step being nondeterministic on its own — hence "contention or a flake" rather than either alone. It
 * does not say which, and the admission limit would not tell it: that is what was permitted, not the
 * concurrency that actually happened, and a full budget with nine steps cached is none at all.
 *
 * A pass is also the dangerous output: it is the one a reader can mistake for the chain being fine. It says
 * "fails" in the sentence, the exit code stays 1, and the retry records nothing — `run` rather than
 * `runAndStamp` for the chain's own stamp, and `DIAGNOSTIC_RUN_ENV` for a step that caches inside itself —
 * so the next chain has to do the step again. The second half was missing until 2026-10-02, and a crowded
 * failure of `test:unit:host` went green on the next chain having run no tests at all. A green-on-retry nobody
 * sees is how a flake becomes rot, and those are what stop this feature making the repo worse than not having
 * it.
 */
export function classifyLine(
  retry: { readonly code: number; readonly ms: number; readonly timedOut?: true },
  /** The machine the costs were measured on (`MEASURED_ON`), which is what licenses the word "wedged" */
  measuredOn: Machine,
): string {
  const took = `${(retry.ms / 1000).toFixed(1)}s`;
  // Running alone rules out contention, which is the question this re-run exists to answer — but not slowness.
  // A deadline is sized for a machine this one may be smaller than, so off that machine "wedged" is the half
  // the retry cannot establish, and `timedOutBecause` draws the same distinction for the first run's message.
  if (retry.timedOut) {
    return isMeasuredMachine(measuredOn)
      ? `\nre-ran it alone: timed out after ${took} — wedged, not crowded.`
      : `\nre-ran it alone: timed out after ${took} — not crowded, which is all this says. Deadlines are sized `
        + `against ${machineText(measuredOn)} and this is ${machineText(thisMachine())}, so wedged and simply `
        + 'slow are both still open.';
  }
  return retry.code === 0
    ? `\nre-ran it alone: passed in ${took} — contention or a flake, not the code. The chain still fails.`
    : `\nre-ran it alone: failed again (exit ${retry.code}) in ${took} — the failure is real.`;
}

/**
 * How much shortening each step on the critical path could *possibly* buy — which is the question
 * "what should I make faster" actually wants, and not the one a duration answers.
 *
 * A step's saving is capped by the second-longest path, so a long step on a dense graph is worth almost
 * nothing: measured 2026-10-06, `test:packaged-authoring:author` is 95s of a 118s path and making it
 * **free** buys 19s, because another route sits at 99s. Three proposals in one day were sized by reading a
 * duration and each was bounded by a path nobody had computed — the pack pool (0s, off the path), the
 * integration pool (0s cold), the renderer's vite build (0s). This is the line that answers them before
 * anyone spends a day.
 *
 * **Only a step on the path is asked**, because zeroing one off it cannot shorten the longest route — so
 * this is as many `criticalPath` calls as the path is long, three today, and not one per step.
 *
 * Silent where the path is a single step, as `criticalPathLine` is: there is no competing route to be
 * bounded by, so the step's own duration is the answer and its line already said it.
 */
export function pathSavingsLine(steps: readonly SchedulableStep[]): string {
  const base = criticalPath(steps);
  if (base.names.length < 2) return '';
  const freed = (name: string): number =>
    criticalPath(steps.map((step) => (step.name === name ? { ...step, seconds: 0 } : step))).seconds;
  const buys = base.names
    .map((name) => ({ name, saving: base.seconds - freed(name) }))
    .filter(({ saving }) => saving > 0)
    .sort((a, b) => b.saving - a.saving);
  if (buys.length === 0) return '';
  return `the most any one can buy: ${buys.map(({ name, saving }) => `${name} ${saving}s`).join(', ')}`;
}

/**
 * The longest chain of steps a run has to wait through, as a line — and the answer to "which step is
 * worth making faster".
 *
 * **Printed for a plan as well as for a run, which is the point.** A step off this path runs inside the
 * shadow of the ones on it, so its own duration is not a saving, and a step's duration alone cannot say
 * which it is. `--dry` gives the planned run's path and `--dry --all` the cold chain's, since `--all` plans
 * every step.
 *
 * `source` separates the two numbers rather than letting one wear the other's authority: a run has measured
 * each step, a plan has only the declared table, which is one machine's by declaration (`MEASURED_ON`).
 *
 * Empty for a path of one step, where the step's own line already said what it cost.
 */
export function criticalPathLine(steps: readonly SchedulableStep[], source: 'declared' | 'measured'): string {
  const path = criticalPath(steps);
  if (path.names.length < 2) return '';
  return `critical path ${path.seconds}s${source === 'declared' ? ' declared' : ''} (${path.names.join(' -> ')})`;
}
