// The pre-merge chain's run order is derived from what each step reads and writes — no step declares an
// edge — so what this pins is that the derivation is a topological sort and that a wrong graph fails before
// any step runs: a six-minute chain should not discover a cycle halfway through.
// What it does not pin is the derivation against the `needs` table it replaced: that snapshot existed for
// the one commit that deleted those fields and went with them, since keeping it would be a second record of
// the graph, able to disagree with the first. The property is what survives, here and in `chain-schedule`
// (two conflicting steps never overlap) and `chain-inputs` (the derived ancestors are walked).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, chainSteps, conflictsOf, dependsOn, orderedSteps, STEP_TABLES, type ChainStep } from '../../../scripts/lib/chain-steps.ts';
import { declaredAt } from '../../../scripts/lib/chain-output.ts';

describe('the chain graph', () => {
  it('orders every step after the steps it depends on', () => {
    const order = orderedSteps().map((s) => s.name);
    expect(order).toHaveLength(CHAIN_STEPS.length);
    for (const step of CHAIN_STEPS) {
      for (const need of dependsOn(step)) {
        expect(order.indexOf(need), `${need} must come before ${step.name}`).toBeLessThan(order.indexOf(step.name));
      }
    }
  });

  it('derives the order rather than reading the table\'s, so a table in the wrong order still runs right', () => {
    // The table happens to be written in a valid order, so a sort that merely returned it would pass the test
    // above. Reversed, it is invalid — every step precedes what it needs — and the result must still be valid.
    const reversed = [...CHAIN_STEPS].reverse();
    const order = orderedSteps(reversed).map((s) => s.name);
    expect(order).toHaveLength(CHAIN_STEPS.length);
    for (const step of CHAIN_STEPS) {
      for (const need of dependsOn(step)) {
        expect(order.indexOf(need), `${need} must come before ${step.name}`).toBeLessThan(order.indexOf(step.name));
      }
    }
    expect(order).not.toEqual(reversed.map((s) => s.name));
  });

  /**
   * Two steps each reading what the other writes. A derived graph can still cycle — the derivation only
   * refuses to invent an edge, not to find a circular one — and a six-minute chain must not discover it
   * halfway through.
   */
  it('refuses a cycle', () => {
    const steps: ChainStep[] = [
      { name: 'a', inputs: ['y'], outputs: ['x'] },
      { name: 'b', inputs: ['x'], outputs: ['y'] },
    ];
    expect(() => orderedSteps(steps)).toThrow(/cycle/);
  });

  /**
   * **The same property, through the door the case above does not reach.** A two-step cycle leaves one
   * element in the reduction's candidate list, so its pairwise filter short-circuits and the transitive walk
   * is never called: that case exercises the topological sort and not the derivation. Give the cycle a step
   * with two producers and the walk runs, re-enters an answer still being computed, and the verdict used to
   * be `RangeError: Maximum call stack size exceeded` — a wrong graph failing, but not *naming itself*,
   * which is what the header above promises. Both shapes are kept because neither covers the other.
   */
  it('refuses a cycle reached through a step with two producers, naming it rather than overflowing', () => {
    const steps: ChainStep[] = [
      { name: 'a', inputs: ['x', 'y'], outputs: ['z'] },
      { name: 'b', inputs: ['z'], outputs: ['x'] },
      { name: 'c', inputs: [], outputs: ['y'] },
    ];
    expect(() => orderedSteps(steps)).toThrow(/cycle through a/);
  });

  /**
   * A mutex has no direction, so this one is a preference — and it was held by nothing but the order the
   * two happen to sit in the table.
   *
   * `test:smoke` and `test` both write `tests/results`, which makes them a derived mutex: the scheduler will
   * not overlap them, and either order satisfies it. Running the six-second gate before the twenty-six
   * second harness is what anyone wants, and until this case existed, reordering the table would have
   * silently swapped them. Named here rather than declared on a step, because a preference between two
   * steps is not a property of either.
   */
  it('runs the smoke gate before the harness they are mutexed by', () => {
    const order = orderedSteps(chainSteps(['test'])).map((step) => step.name);
    expect(order, 'the opt-in harness is not in this plan, so there is nothing to order').toContain('test');
    const smoke = CHAIN_STEPS.find((step) => step.name === 'test:smoke')!;
    expect(conflictsOf(smoke), 'the two no longer share a path, so this preference has lost its subject')
      .toContain('test');
    expect(order.indexOf('test:smoke')).toBeLessThan(order.indexOf('test'));
  });

  /**
   * The E2E harness reads the published trees, so it may not run beside the step that rewrites them.
   *
   * `packages:check` runs `attw --pack`, which packs a tarball *inside* the tree it is checking, and
   * `stagePublishTree` removes and recreates that tree — while every E2E spec loads its fixture from
   * `@abuddy/testing`'s built bundle, which lives there. `test:smoke` declared those trees and was therefore
   * mutexed; `test` declared only the app's four dists, so the pair was kept apart by nothing but the order
   * the scheduler happened to pick. Asserted on `test` rather than left to the derivation, because what makes
   * the mutex exist is one declaration that is easy to drop.
   */
  it('keeps the harness away from the step that rewrites what it loads', () => {
    const harness = CHAIN_STEPS.find((step) => step.name === 'test')!;
    expect(conflictsOf(harness), 'the harness no longer declares the published trees it imports from')
      .toContain('packages:check');
  });

  /**
   * Every step can be pointed at, which is what lets a run print where its reasoning lives instead of
   * repeating it.
   *
   * Derived from `STEP_TABLES` rather than from one file, because that is the mistake this replaces:
   * `declaredIn` searched `chain-steps.ts` alone and silently found nothing for the seventeen typecheck legs
   * and the two pool steps, whose names are generated. Nothing noticed, because only a `neverCachedBecause`
   * step prints the pointer and both of those live in the file it did search — so the first leg to become
   * never-cached would have lost it. Drop a table from the list and this fails for seventeen steps.
   */
  it('declares every step somewhere a run can point at', () => {
    const sources = STEP_TABLES.map((file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'));
    expect(CHAIN_STEPS.length, 'the table emptied, so this would pass over nothing').toBeGreaterThan(25);
    const lost = CHAIN_STEPS.filter((step) => sources.every((source) => declaredAt(source, step.name) === undefined));
    expect(lost.map((step) => step.name), 'nothing names these, so a run cannot point at their reasoning').toEqual([]);
  });

  it('refuses two steps with one name, which would make an edge ambiguous', () => {
    const steps: ChainStep[] = [{ name: 'a', inputs: [] }, { name: 'a', inputs: [] }];
    expect(() => orderedSteps(steps)).toThrow(/Two chain steps named a/);
  });

  /**
   * A step may go uncached for one of two reasons, and both are properties of the step rather than a name.
   *
   * Its pass is not reproducible — the E2E suite, which drives real Electron — or its *effect* is recorded
   * where `fingerprintUnit` cannot see it. `packages:ensure` is the second kind: what it guarantees is that
   * the built packages are current, and whether they are lives in `node_modules/.cache/abuddy-packages-build`,
   * which is neither among its inputs nor content-hashed as an output. Measured 2026-09-26: with those stamps
   * removed and `dist` still present, the step reported `cached` while `packagesBuiltOrRefuse()` refused, so
   * every step guarding on the built packages failed at collection — nested caches that can disagree, the
   * same class this branch fixed for the two unit pools.
   *
   * Written as the rule so a third uncached step has to earn it: anything that writes the package build
   * outputs cannot be cached on its inputs alone, and anything else needs a reason in the list below.
   */
  it('makes every uncached step say why in a sentence, which is what the chain prints for it', () => {
    expect(CHAIN_STEPS.filter((s) => s.neverCachedBecause !== undefined && s.neverCachedBecause.length < 20)
      .map((s) => s.name), 'an uncached step needs a reason, not a flag: the chain prints this where a cache '
      + 'verdict would go, and the line it replaced was hardcoded about Electron and wrong about the other '
      + 'step that opted out').toEqual([]);
  });

  /**
   * An opt-in step is declared but not gated on. The declarations are the reason it stays: `chain-inputs`
   * reads every step's `inputs` to prove the tracked tree is covered, so deleting the E2E step would leave
   * `tests/e2e` watched by nothing while looking like a simplification.
   */
  describe('a step the chain knows about but does not gate on', () => {
    it('is left out by default and put back when asked for', () => {
      const byDefault = chainSteps().map((s) => s.name);
      expect(byDefault, 'the E2E suite drives the app; it is not a regression gate').not.toContain('test');
      expect(chainSteps(['test']).map((s) => s.name), '`--e2e` runs it').toContain('test');
    });

    it('says why, as an uncached step has to', () => {
      expect(CHAIN_STEPS.filter((s) => s.optInBecause !== undefined && s.optInBecause.length < 20).map((s) => s.name),
        'an opt-in step needs a reason, not a flag').toEqual([]);
    });

    /**
     * The one way this breaks: something depends on a step the default run does not include, so the chain
     * is missing a dependency and finds out halfway through. It fails at the selector instead.
     *
     * Asked of `chainSteps` rather than `orderedSteps`, because that is the only place it can be asked
     * now. Edges derive from the list they are given, so a step filtered out of the list is simply not
     * depended on by it; the refusal has to derive against the *whole* table, which is what `chainSteps`
     * does and why it takes one.
     */
    it('refuses a graph where something depends on one', () => {
      const steps = CHAIN_STEPS.map((s) => (s.name === 'build:app' ? { ...s, optInBecause: 'for the case' } : s));
      expect(() => chainSteps([], steps))
        .toThrow(/depends on build:app, which is opt-in/);
    });
  });

  it('does not cache the step that guarantees the built packages', () => {
    expect(CHAIN_STEPS.find((s) => s.name === 'packages:ensure')!.neverCachedBecause,
      'it would cache on its inputs while what it guarantees is recorded in stamps the fingerprint cannot '
      + 'see. Measured: with those stamps cleared and dist still present, the step reported `cached` while '
      + 'packagesBuiltOrRefuse() refused, so every step reading the built packages failed at collection')
      .toBeDefined();
  });
});

describe('every spawn an orchestrator makes is bounded', () => {
  const REPO = REPO_ROOT;
  const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf-8');

  // An unbounded run cannot fail — it waits until a person notices and kills it by pid, which is how this
  // repo collected an orphaned build at 99% CPU for a day. `boundedSpawn` bounds the wall clock and kills
  // the process group rather than the child, so nothing outlives the run that started it.
  it.each(['scripts/chain.ts', 'scripts/test-unit.ts'])('%s spawns only through boundedSpawn', (file) => {
    const source = read(file);
    expect(source, `${file} imports spawn directly`).not.toMatch(/import \{[^}]*\bspawn\b[^}]*\} from 'node:child_process'/);
    expect(source).toContain('boundedSpawn');
  });

  // A shell script run through the chain is bounded by the step's budget, but the direct run is the one
  // people and agents use, and it had no bound at all. test-packaged-authoring.sh is why: its expect block
  // sets `timeout 120`, which covers a pattern match and not the `wait` after it, and it once hung a machine.
  it('every npm script that runs a shell script bounds it', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    const unbounded = Object.entries(scripts)
      .filter(([, command]) => command.includes('tests/scripts/') && !command.includes('scripts/bounded.ts'))
      .map(([name]) => name);
    expect(unbounded, 'these run a shell script with no wall-clock budget').toEqual([]);
  });

  // The budget is sized from the measurement, so a step with none gets only a loose default
  it('every chain step declares what it costs healthy', () => {
    expect(CHAIN_STEPS.filter((step) => step.seconds === undefined).map((step) => step.name)).toEqual([]);
  });
});
