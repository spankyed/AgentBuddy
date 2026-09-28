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
 * What a run says about why a step ran, against what `--dry` says.
 *
 * A step that is never cached carries a sentence explaining the design choice, and that sentence is the same on
 * every run — the longest text on the screen and the least specific to the run in front of you. A run reports the
 * verdict; `--dry`, which is the question "why would this run?", keeps the whole answer.
 */
export const briefly = (reason: string): string =>
  (reason.startsWith('never cached:') ? 'never cached' : reason);
