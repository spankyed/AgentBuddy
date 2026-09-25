// The pre-merge chain's run order is derived from each step's `needs`, not written down, so what this pins is
// that the derivation is a topological sort and that a wrong graph fails before any step runs — a six-minute
// chain should not discover a cycle halfway through. See docs/goals/goal-test-tiers.md.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAIN_STEPS, orderedSteps, type ChainStep } from '../../../../scripts/lib/chain-steps.ts';

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
    const steps: ChainStep[] = [{ name: 'a', tier: 1, needs: ['nope'] }];
    expect(() => orderedSteps(steps)).toThrow(/needs nope, which is not a step/);
  });

  it('refuses a cycle', () => {
    const steps: ChainStep[] = [{ name: 'a', tier: 1, needs: ['b'] }, { name: 'b', tier: 1, needs: ['a'] }];
    expect(() => orderedSteps(steps)).toThrow(/cycle/);
  });

  it('refuses two steps with one name, which would make `needs` ambiguous', () => {
    const steps: ChainStep[] = [{ name: 'a', tier: 1, needs: [] }, { name: 'a', tier: 1, needs: [] }];
    expect(() => orderedSteps(steps)).toThrow(/Two chain steps named a/);
  });

  it('caches every step but the E2E suite, whose pass is not reproducible', () => {
    expect(CHAIN_STEPS.filter((s) => s.cache === false).map((s) => s.name)).toEqual(['test']);
  });
});

describe('every spawn an orchestrator makes is bounded', () => {
  const REPO = path.resolve(import.meta.dirname, '../../../..');
  const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf-8');

  // An unbounded run cannot fail — it waits until a person notices and kills it by pid, which is how this
  // repo collected an orphaned build at 99% CPU for a day. `boundedSpawn` bounds the wall clock and kills
  // the process group rather than the child, so nothing outlives the run that started it.
  it.each(['scripts/chain.ts', 'scripts/test-unit.ts'])('%s spawns only through boundedSpawn', (file) => {
    const source = read(file);
    expect(source, `${file} imports spawn directly`).not.toMatch(/import \{[^}]*\bspawn\b[^}]*\} from 'node:child_process'/);
    expect(source).toContain('boundedSpawn');
  });

  // The budget is sized from the measurement, so a step with none gets only a loose default
  it('every chain step declares what it costs healthy', () => {
    expect(CHAIN_STEPS.filter((step) => step.seconds === undefined).map((step) => step.name)).toEqual([]);
  });
});
