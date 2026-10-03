import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, MEASURED_ON } from '../../../scripts/lib/chain-steps.ts';
import { machineLine, planMachineEdit, planSecondsEdits, SECONDS_TABLES } from '../../../scripts/lib/record-seconds.ts';
import { movedBeyondBand } from '../../../scripts/lib/measure.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * `npm run chain -- --all --record`, which is the update half `seconds` never had.
 *
 * `seconds` is a sample: it records a measurement, so it cannot re-derive itself and a `:check` that
 * recomputes is not available to it. `driftReport` has always been its check. What was missing is the
 * write, and a write into source is the part worth holding — a rewriter wrong about a span corrupts a
 * file rather than failing one.
 *
 * Tested against sources passed in rather than the tables on disk, so these cases rewrite nothing.
 */
const tables = (): Map<string, string> =>
  new Map(SECONDS_TABLES.map((file) => [file, fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8')]));

const band = (was: number | undefined, now: number): boolean => movedBeyondBand(was, now, 1);
const declared = (): Map<string, number> =>
  new Map(CHAIN_STEPS.flatMap((step) => (step.seconds === undefined ? [] : [[step.name, step.seconds] as const])));

describe('recording what a step cost', () => {
  it('finds every step declared in exactly one table, so none is silently untracked', () => {
    const steps = population('steps with a declared cost', [...declared().keys()], { atLeast: 25 });
    // Well past the band for every step, so each one must be locatable. Doubling is not enough: two
    // steps declare 1s and the band's floor is 1s, so twice their cost does not move them.
    const moved = new Map(steps.map((name) => [name, declared().get(name)! * 3 + 10]));
    const { edits } = planSecondsEdits(tables(), moved, declared(), band);
    expect(edits.map((edit) => edit.step).sort(), 'a step whose cost this cannot locate would stop being recorded')
      .toEqual([...steps].sort());
  });

  it('writes the measurement into the table that declares it', () => {
    const { edits, sources } = planSecondsEdits(tables(), new Map([['compile', 99]]), declared(), band);
    expect(edits).toEqual([{ step: 'compile', from: declared().get('compile'), to: 99, file: 'scripts/lib/chain-steps.ts' }]);
    // The class sits between the name and the cost, and this assertion is why that matters: the rewriter
    // finds `seconds:` by scanning from `name: '<step>'` to the next `{ name: '`, so a sibling field is safe
    // and anything named `…seconds…` would not be
    expect(sources.get('scripts/lib/chain-steps.ts')).toContain("{ name: 'compile', timeout: 'quick', seconds: 99,");
    expect(sources.get('scripts/lib/typecheck-legs.ts'), 'the other table was rewritten too')
      .toBe(tables().get('scripts/lib/typecheck-legs.ts'));
  });

  /** A pooled step's cost is a key in `POOL_SECONDS`, not a field on the step, and must still be found */
  it('writes a pooled step cost, which is declared somewhere else entirely', () => {
    const { edits, sources } = planSecondsEdits(tables(), new Map([['test:unit:host', 99]]), declared(), band);
    expect(edits.map((edit) => edit.step)).toEqual(['test:unit:host']);
    expect(sources.get('scripts/lib/chain-steps.ts')).toMatch(/host: 99/);
  });

  // The band is the whole reason this is safe to run repeatedly: a sample wanders, and rewriting a row
  // that already agrees is the churn it exists to prevent
  it('leaves a cost that moved inside the band alone', () => {
    const was = declared().get('compile')!;
    const { edits } = planSecondsEdits(tables(), new Map([['compile', was]]), declared(), band);
    expect(edits, 'an unchanged measurement rewrote the table').toEqual([]);
  });

  /**
   * And it refuses rather than guessing, in the one direction that can happen: a step it cannot locate.
   *
   * Its other refusal — the span not holding what was read there — has no case, because it cannot fire
   * as the code stands: the digits are read from the same source string they are then verified against,
   * and each step's position is recomputed from the updated source on its own iteration. It is an
   * assertion, and the edit that would make it fire is hoisting the span lookup out of the loop to
   * compute every offset up front. Do that and the first splice shifts every later one; the check is
   * what turns that into a refusal rather than a corrupted table.
   */
  /**
   * `--adopt`, which is the other half of recording on a machine that is not the table's.
   *
   * **Its own locator, not a shape added to the numeric splicer.** Every span that one finds is
   * `\d+(?:\.\d+)?` and every replacement is `String(now)`; a machine holds a string, so teaching it about
   * strings would add a shape to the one module that rewrites committed source. What it keeps instead is the
   * habit: find exactly one declaration, and refuse anything that is not the shape it knows how to replace.
   *
   * The defect this closes: nothing wrote `MEASURED_ON`, so `--record --force` on another box moved the costs
   * and left the constant naming the old machine — and every check scoped on it then skipped the box whose
   * numbers were in the file and ran on the box whose were not.
   */
  it('rewrites the machine the table was measured on, and nothing else in the file', () => {
    const source = tables().get('scripts/lib/chain-steps.ts')!;
    const next = planMachineEdit(source, { cpu: 'Some Other CPU', cores: 4 });

    expect(next).toContain("export const MEASURED_ON: Machine = { cpu: 'Some Other CPU', cores: 4 };");
    expect(next.length - source.length, 'one line replaced, so the rest of the table is untouched')
      .toBe(machineLine({ cpu: 'Some Other CPU', cores: 4 }).length - machineLine(MEASURED_ON).length);
  });

  it.each([
    ['there is no declaration to find', 'export const SOMETHING_ELSE = 1;\n', /No .* declaration/],
    ['it is declared twice', `${machineLine(MEASURED_ON)}\n${machineLine(MEASURED_ON)}\n`, /declared twice/],
    ['it is spread over more than its line', 'export const MEASURED_ON: Machine = {\n  cpu: \'x\', cores: 1,\n};\n', /more than its line/],
  ])('refuses to rewrite when %s', (_what, source, message) => {
    expect(() => planMachineEdit(source, MEASURED_ON)).toThrow(message);
  });

  it('refuses a step it cannot find in any table', () => {
    const measured = new Map([['no-such-step', 99]]);
    expect(() => planSecondsEdits(tables(), measured, new Map(), band))
      .toThrow(/is declared in 0 places, not one/);
  });
});
