/**
 * The tests that passed past their size budget, which are reported and never failed (`DEADLINE_FACTOR`).
 *
 * The pool writes one line per test into its output and the chain reads them back under the step, as it does
 * the slowest tests — a passing step's output is buffered and shown only on failure, so this is how a slow
 * pass reaches anyone. The line is written and parsed here and nowhere else, so the two cannot drift.
 */
import * as path from 'node:path';
import type { ReportedRun } from './spec-durations-reporter.ts';
import type { TimeoutOverride } from './test-timeouts.ts';
import type { UnitSuite } from './unit-suites.ts';

export interface OverBudgetPass {
  /** Repo-relative spec path */
  readonly file: string;
  readonly name: string;
  readonly ms: number;
  readonly budgetMs: number;
}

/**
 * Whether a test's name is one an override was declared for. An `it.each` override is named by its template,
 * so its placeholders (`%s`, `$name`) match whatever the table put there.
 */
function declares(override: Pick<TimeoutOverride, 'name'>, name: string): boolean {
  if (override.name === name) return true;
  if (!/%[sdifjo#]|\$[\w.]+/.test(override.name)) return false;
  const pattern = override.name.split(/(%[sdifjo#]|\$[\w.]+)/)
    .map((part, i) => (i % 2 === 1 ? '.*' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${pattern}$`).test(name);
}

/**
 * The reported passes past their project's budget, less the tests that declare a timeout of their own: those
 * are measured against what they declared, and a pass inside it is not over anything.
 */
export function overBudgetPasses(
  reported: ReportedRun,
  suites: readonly UnitSuite[],
  overridesOf: (repoFile: string) => readonly Pick<TimeoutOverride, 'name'>[],
): OverBudgetPass[] {
  const dirOf = new Map(suites.map((suite) => [suite.workspace, suite.dir]));
  return reported.modules.flatMap((module) => {
    const dir = dirOf.get(module.project);
    if (dir === undefined || module.overBudget.length === 0) return [];
    const file = path.join('packages', dir, module.file);
    const declared = overridesOf(file);
    return module.overBudget
      .filter((test) => !declared.some((override) => declares(override, test.name)))
      .map((test) => ({ file, name: test.name, ms: test.ms, budgetMs: test.budgetMs }));
  });
}

const PREFIX = 'over budget:';

/** The line the pool prints for one pass, which `overBudgetLines` reads back */
export const overBudgetLine = (pass: OverBudgetPass): string =>
  `${PREFIX} ${Math.round(pass.ms)}ms of ${pass.budgetMs}ms — ${pass.file} > ${pass.name}`;

// eslint-disable-next-line no-control-regex -- the runners colour their output and this reads it back
const ANSI = /\u001B\[[0-9;]*m/g;

/** The over-budget passes a step's output reports, as the chain prints them under the step */
export function overBudgetLines(output: string): { ms: number; budgetMs: number; test: string }[] {
  const found: { ms: number; budgetMs: number; test: string }[] = [];
  for (const raw of output.replace(ANSI, '').split('\n')) {
    const match = /^over budget: (\d+)ms of (\d+)ms — (.+)$/.exec(raw.trim());
    if (match) found.push({ ms: Number(match[1]), budgetMs: Number(match[2]), test: match[3] });
  }
  return found;
}
