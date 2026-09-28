/**
 * How a chain run puts a step's line on a terminal.
 *
 * Its own module because the chain's own file runs the chain on import: a spec that wants to check the columns
 * cannot load `chain.ts` without starting a six-minute build.
 */
import { covers } from '@abuddy/host/build/packages-built';

/** How wide a step's name column is, in every row that has one */
export const STEP_NAME_WIDTH = 26;

/** Where a run's reason starts: verdict(7) + ` ` + tier(2) + ` ` + name(26) + ` ` + time(6) + two spaces */
export const REASON_COLUMN = 46;

/**
 * Where a reason starts in the end-of-run reports, which indent by two rather than carrying a verdict column.
 *
 * A constant because two things have to agree on it — the step's own row and the lines listing what moved under
 * it — and the first version used a literal in each. They were two apart, so every file the report named sat
 * just left of the reason it explained.
 */
export const REPORT_REASON_COLUMN = 2 + STEP_NAME_WIDTH + 1;

/** The same, for `--dry`, which reports no time */
export const DRY_REASON_COLUMN = 38;

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
 */
export function declaredAt(source: string, name: string): number | undefined {
  const index = source.split('\n').findIndex((line) => line.includes(`name: '${name}'`));
  return index === -1 ? undefined : index + 1;
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

/** Where a step's time ends, so a line beneath it can put a time in the same column */
export const TIME_COLUMN = 38;

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
 */
export const whenChanged = (mtimeMs: number | undefined, ranUntil: number | undefined): '' | 'while it ran' | 'since it ran' =>
  (mtimeMs === undefined || ranUntil === undefined ? '' : mtimeMs <= ranUntil ? 'while it ran' : 'since it ran');

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
  /** From `whenChanged`; empty when the stamp cannot say */
  readonly when: '' | 'while it ran' | 'since it ran';
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
 */
export function staleLines(found: {
  readonly indent: number;
  readonly gained: readonly string[];
  readonly lost: readonly string[];
  readonly files: readonly ChangedInput[];
  readonly identical: readonly string[];
  /** Whether the stamp carried a diagnosis at all — one written before it did cannot explain itself */
  readonly recorded: boolean;
  readonly cap?: number;
}): string[] {
  const { indent, gained, lost, files, identical, recorded, cap = CHANGED_CAP } = found;
  const pad = ' '.repeat(indent);
  const more = (count: number) => (count > cap ? [`${pad}and ${count - cap} more`] : []);
  if (!recorded) return [`${pad}its last run recorded no per-file digests, so it cannot say which input moved`].map(dim);
  const declared = [...gained.map((one) => `+${one}`), ...lost.map((one) => `-${one}`)];
  const lines = declared.length > 0
    ? [`${pad}its declared inputs moved: ${declared.slice(0, cap).join(', ')}`, ...more(declared.length)]
    : [
      ...files.slice(0, cap).map(({ file, how, when, writer }) =>
        `${pad}${file} — ${how}${when === '' ? '' : ` ${when}`}${writer === undefined ? '' : `, ${writer}'s declared output`}`),
      ...more(files.length),
    ];
  if (lines.length === 0) lines.push(`${pad}nothing under its inputs differs now, so whatever moved has moved back`);
  if (identical.length > 0) {
    lines.push(`${pad}${identical.length} file${identical.length === 1 ? '' : 's'} rewritten with identical bytes while it ran`
      + ` (${identical[0]}${identical.length > 1 ? ', …' : ''}) — harmless to the cache`);
  }
  return lines.map(dim);
}
