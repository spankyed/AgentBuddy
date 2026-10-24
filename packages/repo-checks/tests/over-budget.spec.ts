// A test that passes past its size budget is reported, never failed (`DEADLINE_FACTOR`): the pool names it in a
// line the chain reads back under the step. What is asked here is which passes are named — not one whose spec
// declares its own timeout — and that the line the pool writes is the line the chain reads.
import { describe, expect, it } from 'vitest';
import { overBudgetLine, overBudgetLines, overBudgetPasses } from '../../../scripts/lib/over-budget.ts';
import type { ReportedRun } from '../../../scripts/lib/spec-durations-reporter.ts';
import type { UnitSuite } from '../../../scripts/lib/unit-suites.ts';

const suites = [{ dir: 'apack-cli', workspace: '@apackdev/cli' }] as UnitSuite[];

const run = (overBudget: ReportedRun['modules'][number]['overBudget'], project = '@apackdev/cli'): ReportedRun => ({
  projects: [project],
  modules: [{ project, file: 'tests/build/swap.integration.spec.ts', ms: 1, overheadMs: 1, skipped: false, overBudget }],
});

describe('the passes it names', () => {
  it('names a pass past its budget, by its spec and its name', () => {
    expect(overBudgetPasses(run([{ name: 'refuses copied media', ms: 61_770, budgetMs: 60_000 }]), suites, () => []))
      .toEqual([{ file: 'packages/apack-cli/tests/build/swap.integration.spec.ts', name: 'refuses copied media', ms: 61_770, budgetMs: 60_000 }]);
  });

  it('leaves out a test that declares its own timeout, by its name or its it.each template', () => {
    const passes = overBudgetPasses(run([
      { name: 'rebuilds damaged facade data', ms: 70_000, budgetMs: 60_000 },
      { name: 'rebuilds damaged cache data', ms: 70_000, budgetMs: 60_000 },
      { name: 'publishes help', ms: 70_000, budgetMs: 60_000 },
      { name: 'refuses copied media', ms: 70_000, budgetMs: 60_000 },
    ]), suites, () => [{ name: 'rebuilds damaged %s data' }, { name: 'publishes help' }]);
    expect(passes.map((pass) => pass.name)).toEqual(['refuses copied media']);
  });

  it('names nothing for a project the run was not asked about', () => {
    expect(overBudgetPasses(run([{ name: 'x', ms: 70_000, budgetMs: 60_000 }], '@app/elsewhere'), suites, () => [])).toEqual([]);
  });
});

describe('the line between the pool and the chain', () => {
  it('reads back what was written, coloured or not', () => {
    const pass = { file: 'packages/apack-cli/tests/a.integration.spec.ts', name: 'a — b > c', ms: 61_770.4, budgetMs: 60_000 };
    const output = `noise\n\u001B[2m${overBudgetLine(pass)}\u001B[22m\n ✓ unrelated 400ms\n`;
    expect(overBudgetLines(output)).toEqual([{ ms: 61_770, budgetMs: 60_000, test: 'packages/apack-cli/tests/a.integration.spec.ts > a — b > c' }]);
  });

  it('reads nothing from output that names no pass', () => {
    expect(overBudgetLines(' ✓ a test 61770ms\nover budget for lunch\n')).toEqual([]);
  });
});
