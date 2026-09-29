/**
 * The timeout overrides a spec file declares, read from its syntax tree.
 *
 * A tier budget lives in a vitest config; a third argument to `it()` overrides it for one test. A guard that
 * reads only configs sees the policy and not the escape, which is how fifteen overrides of 60s to 240s sat
 * in tier-1 suites whose budget is 15s.
 *
 * **Read with the compiler, not a regular expression.** Two attempts at matching the source text failed in
 * both directions: `}, 500)` matched `setTimeout(() => {…}, 500)` inside a fixture string and gutted it,
 * while `beforeAll(async () => { … }, 240_000);` on a single line matched nothing at all. A timeout argument
 * is a position in a call expression, so the tree is what knows where it is.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { INTEGRATION_SUITES } from './chain-steps.ts';
import { halfOfPath } from './spec-cost.ts';
import { UNIT_SUITES, unitStepName } from './unit-suites.ts';

/** The vitest callables that take a trailing timeout */
const RUNNERS = new Set(['it', 'test', 'describe', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach']);
/** A hook takes `(fn, timeout)`; everything else takes `(name, fn, timeout)` */
const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);

export interface TimeoutOverride {
  /** Repo-relative, so a key reads the same wherever it is printed */
  readonly file: string;
  /** `it`, `beforeAll`, … — the callable, not the modifier it was reached through */
  readonly runner: string;
  /** The test's name where one is a literal; a hook has none */
  readonly name: string;
  /** Milliseconds, or `undefined` where the argument is not a literal this can evaluate */
  readonly ms: number | undefined;
  readonly line: number;
}

/** How an override is named in the exceptions list, and in anything a person has to read */
export const overrideKey = (override: Pick<TimeoutOverride, 'file' | 'runner' | 'name'>): string =>
  `${override.file} > ${override.name || override.runner}`;

/**
 * Every timeout override in one spec file.
 *
 * The callable is found by walking to the leftmost identifier, so `it`, `it.only`, `it.skipIf(x)(…)` and
 * `it.each(table)(…)` all resolve to `it` and are read at the same argument position.
 */
export function timeoutOverrides(absFile: string, repoRoot: string): TimeoutOverride[] {
  const source = ts.createSourceFile(absFile, fs.readFileSync(absFile, 'utf8'), ts.ScriptTarget.Latest, true);
  const found: TimeoutOverride[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let head: ts.Node = node.expression;
      while (ts.isPropertyAccessExpression(head) || ts.isCallExpression(head)) head = head.expression;
      if (ts.isIdentifier(head) && RUNNERS.has(head.text)) {
        const argument = node.arguments[HOOKS.has(head.text) ? 1 : 2];
        if (argument) {
          const first = node.arguments[0];
          found.push({
            file: path.relative(repoRoot, absFile),
            runner: head.text,
            name: first && ts.isStringLiteralLike(first) ? first.text : '',
            ms: ts.isNumericLiteral(argument) ? Number(argument.text.replace(/_/g, '')) : undefined,
            line: source.getLineAndCharacterOfPosition(argument.getStart(source)).line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every `*.spec.ts` under a directory */
/**
 * The chain step that runs a spec, which is what decides the timeout budget it has to fit inside.
 *
 * Here rather than in the spec that reads it, so the decision has a firing case: a package with a second
 * config runs its integration specs under `test:integration`, a tier-2 step, and everything else runs under
 * its pool's tier-1 step. Naming one package instead of deriving the set put the 8 integration specs in
 * `repo-checks` and `publish-checks` under a tier-1 budget — wrong, and invisible, because neither has a
 * per-test override today and the *configs* were already derived. A rule that can only be wrong later is
 * still wrong now.
 */
export function stepForSpec(file: string): string {
  const dir = file.split('/')[1];
  if (halfOfPath(file) === 'integration' && INTEGRATION_SUITES.some((suite) => suite.dir === dir)) return 'test:integration';
  const suite = UNIT_SUITES.find((candidate) => candidate.dir === dir);
  return suite ? unitStepName(suite) : 'test:unit:host';
}

export function specFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? specFilesUnder(full) : entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}
