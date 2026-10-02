/**
 * How a chain run puts a step's line on a terminal.
 *
 * Its own module because the chain's own file runs the chain on import: a spec that wants to check the columns
 * cannot load `chain.ts` without starting a six-minute build.
 */
import { covers } from '@abuddy/host/build/packages-built';
import { budgetFor } from './bounded-spawn.ts';
import { overBand } from './step-timing.ts';

/**
 * How wide a step's name column is, in every row that has one.
 *
 * At least as wide as the longest step name, or `padEnd` does nothing for that one step and every column
 * measured from here is a character short for its row alone. That is not hypothetical: this was 26 against
 * `test:external-pack:contract`'s 27, so all three row shapes put their continuation lines one column left of
 * the reason above them — including the report this number was introduced to line up. A case holds it to the
 * longest name in the table, because the table is where new step names arrive.
 */
export const STEP_NAME_WIDTH = 27;

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
export const marker = (step: { needsApp?: true } | undefined): string => (step?.needsApp ? 'app' : '   ');

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
 */
export function declaredAt(source: string, name: string): number | undefined {
  const lines = source.split('\n');
  const written = lines.findIndex((line) => line.includes(`name: '${name}'`));
  if (written !== -1) return written + 1;
  const generated = lines.findIndex((line) => {
    const prefix = /name: `([^$`]*)/.exec(line)?.[1];
    return prefix !== undefined && prefix.length > 0 && name.startsWith(prefix);
  });
  return generated === -1 ? undefined : generated + 1;
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
 * What a failing step cost, against what it costs healthy. The timeout branch below already says this and
 * draws its conclusion; an ordinary failure said only its exit code, which is why one unexplained
 * `test:integration` failure took a reader to `chain-steps.ts` and `budgetFor` by hand to find out it had not
 * been killed — every number needed was already here.
 *
 * Past double the declared cost it names the run that tells the two diagnoses apart, because this repo has
 * measured that they differ: under lanes `@abuddy/cli` "began reporting errors it does not report alone"
 * (the note at the top of this file). The band is `overBand` in step-timing.ts, shared with `driftedSteps`
 * rather than restated — it was restated here once, which is two copies of one rule and how they come apart.
 */
export function howLong(
  step: { readonly seconds?: number },
  ms: number,
  lanes: number,
  /** Whether the chain is about to re-run the step alone, in which case suggesting it reads as if no answer followed */
  classifying = false,
): string {
  if (step.seconds === undefined) return '';
  const measured = Math.round(ms / 1000);
  const where = ` after ${(ms / 1000).toFixed(1)}s, against ${step.seconds}s healthy at ${lanes} lane${lanes > 1 ? 's' : ''}`;
  return !classifying && overBand(step.seconds, measured)
    ? `${where}\n  — over twice its measured cost; try \`npm run chain --lanes 1\``
    : where;
}

/**
 * What a drift report means, which depends on the lane count the run used.
 *
 * At `MEASURED_AT_LANES` the numbers are comparable and a drifted step is a stale row, so the value to record
 * is the useful thing to print. At any other lane count they are not comparable at all: measured here,
 * `test:external-pack:contract` costs 57s at three lanes and 18s at one. Printing "record 18" would give a step
 * that takes 57s in the default schedule a 72s kill budget — the mis-sized bound `seconds`' own doc warns
 * about, arrived at by following this tool's advice.
 *
 * The same numbers are worth printing as what they are. Which steps the schedule's contention moves most is not
 * recorded anywhere else. It takes `--all --lanes 1` to see it, not the plain `--lanes 1` a failing step
 * suggests — that run answers the narrower question the failure asks, whether the step passes alone.
 */
export function driftReport(
  drifted: readonly { name: string; declared: number; measured: number }[],
  lanes: number,
  measuredAt: number,
  /** Whether the run did every step's work (`--all`), which is how the table's numbers are taken */
  forced: boolean,
): string {
  // The two directions are not alike, so a run that cannot answer for one can still answer for the other.
  // Under the band is the run's doing: fewer lanes, or most steps cached, is less contention, and with nine of
  // twelve cached three lanes behave as one. Over it is not — less contention should make a step faster, so an
  // overrun on a partial run is the step growing, which is the direction `budgetFor` kills on at four times.
  // Measured over 40 step runs in one day: 6 under the band, 0 over it, so this costs no noise.
  const shown = forced ? drifted : drifted.filter(({ declared, measured }) => overBand(declared, measured));
  if (shown.length === 0) return '';
  const count = `${shown.length} step${shown.length === 1 ? '' : 's'}`;
  const rows = (line: (d: { name: string; declared: number; measured: number }) => string): string =>
    shown.map((d) => `  ${d.name.padEnd(STEP_NAME_WIDTH)} ${line(d)}`).join('\n');

  if (!forced) {
    return `\n${count} ran past twice the declared cost — the step grew, not the schedule:\n`
      + `${rows(({ declared, measured }) => `${declared}s -> ${measured}s  (killed at ${budgetFor(declared) / 1000}s)`)}`;
  }
  if (lanes === measuredAt) {
    return `\n${count} cost something other than chain-steps.ts says — re-measure, or record:\n`
      + `${rows(({ declared, measured }) => `seconds: ${declared} -> ${measured}`)}`;
  }
  return `\nat ${lanes} lane${lanes === 1 ? '' : 's'}, ${count} moved against ${measuredAt}-lane numbers`
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
   * (`ScheduleResult.peers`), and that is the only place the answer exists. `lanes` is gone from the
   * predicate with it: a single-lane run overlaps nothing, so it is already covered.
   */
  readonly ranAlone: boolean;
  /** Its budget is four times its cost; re-running a wedged step spends that again for a message that already interprets itself */
  readonly timedOut: boolean;
  readonly optedOut: boolean;
}): boolean {
  return !run.ranAlone && !run.timedOut && !run.optedOut;
}

/**
 * What the re-run proved.
 *
 * A pass here rules the code out, which is the useful half: the retry runs the same command over the same tree,
 * so anything deterministic in it would fail again. What is left is interference from whatever else was running,
 * or the step being nondeterministic on its own — hence "contention or a flake" rather than either alone. It
 * does not say which, and `lanes` would not tell it: that is the declared count, not the concurrency that
 * actually happened, and three lanes with nine steps cached is none at all.
 *
 * A pass is also the dangerous output: it is the one a reader can mistake for the chain being fine. It says
 * "fails" in the sentence, the exit code stays 1, and the retry writes no stamp — `run` rather than
 * `runAndStamp` — so the next chain has to do the step again. A green-on-retry nobody sees is how a flake
 * becomes rot, and all three of those are what stop this feature making the repo worse than not having it.
 */
export function classifyLine(retry: { readonly code: number; readonly ms: number; readonly timedOut?: true }): string {
  const took = `${(retry.ms / 1000).toFixed(1)}s`;
  if (retry.timedOut) return `\nre-ran it alone: timed out after ${took} — wedged, not crowded.`;
  return retry.code === 0
    ? `\nre-ran it alone: passed in ${took} — contention or a flake, not the code. The chain still fails.`
    : `\nre-ran it alone: failed again (exit ${retry.code}) in ${took} — the failure is real.`;
}
