// How a chain run puts a step on a line. The chain's own file runs the chain on import, so the formatting lives
// in `scripts/lib/chain-output.ts` where a spec can reach it without starting a six-minute build.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from '../../../scripts/lib/chain-steps.ts';
import { briefly, declaredAt, DRY_REASON_COLUMN, REASON_COLUMN, wrapAt } from '../../../scripts/lib/chain-output.ts';

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
 * The columns are constants because two rows have to agree on them — a run's and `--dry`'s — and a literal in
 * either is a number that drifts from the row above it the first time a column changes.
 */
it('composes both rows from the declared columns', () => {
  const chain = fs.readFileSync(path.join(REPO_ROOT, 'scripts/chain.ts'), 'utf-8');
  expect(chain).toContain('wrapAt(REASON_COLUMN');
  expect(chain).toContain('wrapAt(DRY_REASON_COLUMN');
  expect(REASON_COLUMN - DRY_REASON_COLUMN, "a run's rows carry a time column and `--dry`'s do not").toBe(8);
});
