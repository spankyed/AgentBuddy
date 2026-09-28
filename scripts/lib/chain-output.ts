/**
 * How a chain run puts a step's line on a terminal.
 *
 * Its own module because the chain's own file runs the chain on import: a spec that wants to check the columns
 * cannot load `chain.ts` without starting a six-minute build.
 */

/** Where a run's reason starts: verdict(7) + ` ` + tier(2) + ` ` + name(26) + ` ` + time(6) + two spaces */
export const REASON_COLUMN = 46;

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
  steps.find((step) => (step.outputs ?? []).some((out) => file === out || file.startsWith(`${out}/`)))?.name;
