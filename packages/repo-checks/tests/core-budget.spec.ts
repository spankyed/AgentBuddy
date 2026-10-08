// What the chain admits steps on, and whether it still describes the configs it was read from.
//
// `POOL_WIDTH` is a second record of a width its config also holds, which this repo normally refuses. It is
// one here because the configs cannot read the table — they stay literal, since `check:specifiers` reads
// them as text — so the table describes them and the description has to be checked. `chain-table.spec.ts`
// holds the forward direction, each pool against the config it loads; the direction here is the one that
// catches a width nobody told the budget about.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { asPercent, box, coresFor, isMeasuredSchedule, POOL_WIDTH, scheduleMismatch, shareOf, thisMachine } from '../../../scripts/lib/core-budget.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { population } from '@abuddy/sdk/testing';

describe('coresFor', () => {
  // Ten, so the arithmetic below reads as the box this was measured on rather than the one it runs on
  const TEN = 10;

  it('weighs a step with no entry at one core', () => {
    expect(coresFor('typecheck:ears', TEN)).toBe(1);
  });

  it('weighs an uncapped pool at vitest\'s default of one less than the box', () => {
    expect(coresFor('test:unit:host', TEN)).toBe(9);
    expect(coresFor('test:unit:host', 8)).toBe(7);
  });

  it('weighs a share of the box', () => {
    expect(coresFor('test:integration', TEN)).toBe(5);
    expect(coresFor('test:integration', 8)).toBe(4);
  });

  it('weighs a fixed width the same on any box, which is what a bundler takes', () => {
    // The distinction a bare number could not make: `build:app` uses about 2.56 cores for this much work
    // wherever it runs, so a share would have it take twice as much of a box twice the size
    expect(coresFor('build:app', TEN)).toBe(3);
    expect(coresFor('build:app', 20)).toBe(3);
  });

  it('never weighs a fixed width above the box it is running on', () => {
    // Otherwise the budget goes soft for that step alone and admits it beside anything
    expect(coresFor('build:app', 1)).toBe(1);
  });

  it('never weighs a step at less than one core, however small the box', () => {
    // A one-core box makes every share round towards nothing, and a weight of zero is a step that admits
    // beside anything — which is the opposite of what an entry is for
    for (const step of Object.keys(POOL_WIDTH)) expect(coresFor(step, 1), step).toBeGreaterThanOrEqual(1);
  });

  it('reads this machine by default, which is what the chain asks of it', () => {
    // And deliberately not the budget: `--cores N` caps what to spend of this box rather than describing
    // a box of N, so a width is about the machine. `isMeasuredSchedule` below is what that costs
    expect(coresFor('test:integration')).toBe(Math.max(1, Math.round(0.5 * box())));
  });
});

/**
 * The schedule a recorded cost table describes, which takes two numbers rather than one.
 *
 * `--cores` defaults to `box()`, so a run's budget and the box its widths were resolved against normally
 * agree — and a gate that compared only the budget read as sufficient for exactly that reason. The third
 * case is the one it let through.
 */
describe('isMeasuredSchedule', () => {
  const MEASURED = { cpu: 'Apple M1 Pro', cores: 10 } as const;

  it('holds when the budget, the cores and the CPU are all the measured ones', () => {
    expect(isMeasuredSchedule(10, MEASURED, MEASURED)).toBe(true);
  });

  it('refuses another budget', () => {
    expect(isMeasuredSchedule(12, MEASURED, MEASURED)).toBe(false);
  });

  it('refuses another core count, even where the budget is the measured one', () => {
    // Widths are resolved against the machine, so `--cores 10` on a twenty-core box runs twenty-core widths
    // under a ten-core budget. The costs that come out describe neither schedule.
    expect(isMeasuredSchedule(10, MEASURED, { cpu: 'Apple M1 Pro', cores: 20 })).toBe(false);
  });

  /**
   * And another CPU at the same core count, which a core count alone cannot see.
   *
   * This is the hole: keyed on cores, every 10-core machine read as the measured one, so a second developer
   * on a 10-core Mac was offered figures taken on different silicon as though they described their box — the
   * exact failure the portability work was for, surviving for the commonest machine there is.
   */
  it('refuses another CPU at the same core count', () => {
    expect(isMeasuredSchedule(10, MEASURED, { cpu: 'Apple M4 Pro', cores: 10 })).toBe(false);
  });

  it('reads this machine when none is given, which is how the chain asks', () => {
    expect(isMeasuredSchedule(box(), thisMachine())).toBe(true);
  });
});

/**
 * And *which* fact does not hold, which the boolean above hides.
 *
 * **The bug this exists for was in a caller taking the conjunction apart by hand.** It asked
 * `!isMeasuredSchedule` and then re-asked about the machine to choose what to suggest — so a *budget*
 * mismatch printed an instruction only a *machine* mismatch could act on. Advice nobody can act on is what
 * the portability work was removing, so writing the conjunction once was worth a predicate.
 *
 * It also retires a hand-written variant. "Can this machine claim the table" is this question asked of
 * `thisMachine()`, where the machine conjunct is trivially true and only the budget is left — which
 * `chain.ts` had spelled as `budget !== box()`, three lines from a comparison against `measuredOn.cores`.
 */
describe('scheduleMismatch', () => {
  const MEASURED = { cpu: 'Apple M1 Pro', cores: 10 } as const;

  it('says nothing is wrong where the schedule is the measured one', () => {
    expect(scheduleMismatch(10, MEASURED, MEASURED)).toBeUndefined();
  });

  it('names the budget where only the budget differs, so no machine advice is offered', () => {
    expect(scheduleMismatch(9, MEASURED, MEASURED)).toBe('budget');
  });

  it.each([
    ['another CPU at the same core count', { cpu: 'Apple M4 Pro', cores: 10 }],
    ['another core count', { cpu: 'Apple M1 Pro', cores: 20 }],
  ])('names the machine for %s, which is the one a flag can act on', (_what, machine) => {
    expect(scheduleMismatch(10, MEASURED, machine)).toBe('machine');
  });

  /** The machine first, because a run where both differ is one a flag can still do something about */
  it('names the machine where both differ', () => {
    expect(scheduleMismatch(9, MEASURED, { cpu: 'Apple M4 Pro', cores: 8 })).toBe('machine');
  });

  it('asked of this machine, is a question about the budget alone', () => {
    expect(scheduleMismatch(box(), thisMachine())).toBeUndefined();
    expect(scheduleMismatch(box() - 1, thisMachine()), 'which is what `budget !== box()` used to spell')
      .toBe('budget');
  });
});

/** Every vitest config the repo owns: the root ones and each workspace's, which is where a cap can appear */
const VITEST_CONFIG = /^vitest(?:[.-][\w.-]+)?\.config\.ts$/;
const configs = (): string[] => [
  ...fs.readdirSync(REPO_ROOT).filter((entry) => VITEST_CONFIG.test(entry)),
  ...PACKAGE_DIRS.flatMap((dir) => fs.readdirSync(path.join(REPO_ROOT, 'packages', dir))
    .filter((entry) => VITEST_CONFIG.test(entry))
    .map((entry) => path.join('packages', dir, entry))),
];

/**
 * The worker caps a config declares, as written.
 *
 * Text rather than the resolved config, and that is the honest mechanism for this question: what is being
 * asked is whether the file *declares* a cap, and a declaration is what `check:specifiers` reads these
 * files for too. A property form with a value, so the prose in `vitest.integration.config.ts` — which
 * names `maxThreads ?? maxWorkers ?? (cpus - 1)` and tabulates `maxThreads 50%` — is not a hit.
 */
const CAP = /\bmax(?:Threads|Forks|Workers)\s*:\s*'?([^,}'\s]+)'?/g;
const capsInText = (text: string): string[] => [...text.matchAll(CAP)].map((hit) => hit[1]!);
const capsIn = (rel: string): string[] => capsInText(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8'));
describe('a config that caps its workers has told the budget', () => {
  /**
   * Every share `POOL_WIDTH` declares, as a config would write it.
   *
   * Shares only, which is the whole population a config can state: a `cores` entry is a measurement of a
   * bundler and no config sets it, and `UNCAPPED` claims its config sets nothing — `chain-table` holds
   * that half.
   */
  const declared = (): string[] => Object.keys(POOL_WIDTH)
    .map((step) => shareOf(step))
    .filter((share): share is number => share !== undefined)
    .map(asPercent);

  it('finds the caps, so the cases below are not asking about an empty set', () => {
    const found = configs().flatMap(capsIn);
    expect(population('the declared worker caps', found).length).toBeGreaterThan(0);
  });

  it('declares every cap it finds as a share the chain weighs that pool by', () => {
    for (const config of population('the vitest configs', configs())) {
      for (const cap of capsIn(config)) {
        expect(declared(), `${config} caps its workers at ${cap}, which no POOL_WIDTH entry declares — `
          + 'the chain would admit that pool on a weight nobody chose').toContain(cap);
      }
    }
  });

  it('finds a cap added where none was, which is what the case above rests on', () => {
    // The mutation, over text rather than the tree: the subject is the scan, and a scan that missed a
    // declaration would let a new pool take the box while the chain went on weighing it at one core
    expect(capsInText("poolOptions: { threads: { maxThreads: '75%' } },")).toEqual(['75%']);
    expect(declared(), '75% is no declared share, so the case above fails on a config carrying it')
      .not.toContain('75%');
  });

  it('reads a declaration and not the prose about one', () => {
    // Both of these sit in `vitest.integration.config.ts`'s doc block, and either read as a cap would make
    // that file claim widths it does not set
    expect(capsInText('vitest reads this as `poolOptions.maxThreads ?? maxWorkers ?? (cpus - 1)`')).toEqual([]);
    expect(capsInText('*     maxThreads 50%   44.97 48.05 48.22')).toEqual([]);
  });
});
