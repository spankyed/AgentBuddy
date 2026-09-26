// The pre-merge chain's run order is derived from each step's `needs`, not written down, so what this pins is
// that the derivation is a topological sort and that a wrong graph fails before any step runs — a six-minute
// chain should not discover a cycle halfway through. See docs/goals/goal-test-tiers.md.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, orderedSteps, type ChainStep } from '../../../scripts/lib/chain-steps.ts';

describe('the chain graph', () => {
  it('orders every step after the steps it needs', () => {
    const order = orderedSteps().map((s) => s.name);
    expect(order).toHaveLength(CHAIN_STEPS.length);
    for (const step of CHAIN_STEPS) {
      for (const need of step.needs) {
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
      for (const need of step.needs) {
        expect(order.indexOf(need), `${need} must come before ${step.name}`).toBeLessThan(order.indexOf(step.name));
      }
    }
    expect(order).not.toEqual(reversed.map((s) => s.name));
  });

  it('refuses a dependency that is not a step', () => {
    const steps: ChainStep[] = [{ name: 'a', tier: 1, needs: ['nope'], inputs: [] }];
    expect(() => orderedSteps(steps)).toThrow(/needs nope, which is not a step/);
  });

  it('refuses a cycle', () => {
    const steps: ChainStep[] = [{ name: 'a', tier: 1, needs: ['b'], inputs: [] }, { name: 'b', tier: 1, needs: ['a'], inputs: [] }];
    expect(() => orderedSteps(steps)).toThrow(/cycle/);
  });

  it('refuses two steps with one name, which would make `needs` ambiguous', () => {
    const steps: ChainStep[] = [{ name: 'a', tier: 1, needs: [], inputs: [] }, { name: 'a', tier: 1, needs: [], inputs: [] }];
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
  it('makes every uncached step say why, which is what the chain prints for it', () => {
    expect(CHAIN_STEPS.filter((s) => s.cache === false && s.neverCachedBecause === undefined).map((s) => s.name),
      'give these a neverCachedBecause: the chain prints it where a cache verdict would go, and it was one '
      + 'hardcoded sentence about Electron until a second step opted out and it was wrong about that one').toEqual([]);
    expect(CHAIN_STEPS.filter((s) => s.cache !== false && s.neverCachedBecause !== undefined).map((s) => s.name),
      'these give a reason for not being cached and are cached').toEqual([]);
  });

  it('does not cache the step that guarantees the built packages', () => {
    expect(CHAIN_STEPS.find((s) => s.name === 'packages:ensure')!.cache,
      'it would cache on its inputs while what it guarantees is recorded in stamps the fingerprint cannot '
      + 'see. Measured: with those stamps cleared and dist still present, the step reported `cached` while '
      + 'packagesBuiltOrRefuse() refused, so every step reading the built packages failed at collection')
      .toBe(false);
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
