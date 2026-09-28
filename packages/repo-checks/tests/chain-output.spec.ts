// How a chain run puts a step on a line. The chain's own file runs the chain on import, so the formatting lives
// in `scripts/lib/chain-output.ts` where a spec can reach it without starting a six-minute build.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { briefly, DRY_REASON_COLUMN, REASON_COLUMN, wrapAt } from '../../../scripts/lib/chain-output.ts';

describe('wrapAt', () => {
  it('leaves a reason that fits on the line it is on', () => {
    expect(wrapAt(46, 'never cached', 120)).toBe('never cached');
  });

  /**
   * The whole point: a continuation indented to the reason's own column reads as part of that row. Wrapped to
   * column 0 it reads as another step's line, which is what a 180-character reason did to every run that
   * printed one.
   */
  it('indents what it wraps to the column the reason starts at', () => {
    const wrapped = wrapAt(10, 'one two three four five six seven', 24);
    expect(wrapped.split('\n')).toEqual(['one two three four', '          five six seven']);
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

describe('briefly', () => {
  /**
   * A never-cached step's sentence explains a design choice and is the same on every run — the longest text on
   * the screen and the least specific to the run in front of you. `--dry` is the question it answers.
   */
  it('reports the verdict for a step that is never cached, not the essay', () => {
    expect(briefly('never cached: it drives real Electron, and a flaky pass cached green hides a failure'))
      .toBe('never cached');
  });

  it('leaves a reason that is about this run', () => {
    const why = 'its inputs changed since the last successful run';
    expect(briefly(why)).toBe(why);
  });
});

/**
 * The columns are constants because two rows have to agree on them — a run's and `--dry`'s — and a literal in
 * either is a number that drifts from the row above it the first time a column changes.
 */
it('composes both rows from the declared columns', () => {
  const chain = fs.readFileSync(path.join(REPO_ROOT, 'scripts/chain.ts'), 'utf-8');
  expect(chain).toContain('wrapAt(REASON_COLUMN');
  expect(chain).toContain('wrapAt(DRY_REASON_COLUMN');
  expect(REASON_COLUMN - DRY_REASON_COLUMN, "a run's rows carry a time column and `--dry`'s do not").toBe(8);
});
