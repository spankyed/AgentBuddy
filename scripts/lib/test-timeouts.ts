/**
 * The timeout overrides a spec file declares, read from its syntax tree.
 *
 * A size budget lives in a vitest config; a third argument to `it()` overrides it for one test. A guard that
 * reads only configs sees the policy and not the escape, which is how fifteen overrides of 60s to 240s sat
 * in small suites whose budget is 15s.
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
import { CONFIG_BY_HALF, halfOfPath } from './spec-cost.ts';
import type { Size } from './unit-suites.ts';

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
 * The size of the test target a file belongs to, which is what decides the timeout budget it fits inside.
 *
 * There are three targets and this answers for any file in one: a package's fast half, a package's
 * integration half, and the E2E suite. It takes configs and specs alike, because "what budget applies
 * here" is one question and was briefly two functions in two modules deciding it by different means.
 *
 * **The two means are the asymmetry, and it is real.** A config's *existence* is the fact — a package has
 * an integration half exactly when it has an integration config, which is how `INTEGRATION_SUITES` is
 * derived in the first place. A spec's *name* is only a claim: a package without that config runs
 * everything in its fast half, so `x.integration.spec.ts` there is `small` whatever it is called.
 * Checking the claim against `INTEGRATION_SUITES` rather than naming a package is the part with a firing
 * case — naming one put the 8 integration specs in `repo-checks` and `publish-checks` under a small
 * budget while they ran large, invisibly, because neither had a per-test override and the *configs* were
 * already derived.
 *
 * **Not `halfOfPath`, which answers a different question.** That one says which half a spec is *in*, by
 * suffix alone, and `spec-cost` renames files to move them between halves — so the suffix is its subject
 * rather than a hint. The two disagree on exactly one input: a `.integration.spec.ts` in a package with
 * no integration config, which `halfOfPath` calls integration and this calls small. No such file exists,
 * and one would be caught anyway — it would run in neither half, and `spec-cost:check` reports a spec it
 * never measured.
 */
export function sizeOf(file: string): Size {
  // The E2E suite is its own target and belongs to no package
  if (file.endsWith('playwright.config.ts')) return 'large';
  // Integration first: the two names are read from `CONFIG_BY_HALF`, which is where the convention lives
  if (file.endsWith(CONFIG_BY_HALF.integration)) return 'large';
  if (file.endsWith(CONFIG_BY_HALF.fast)) return 'small';
  if (file.endsWith('.spec.ts')) {
    const dir = file.split('/')[1];
    return halfOfPath(file) === 'integration' && INTEGRATION_SUITES.some((suite) => suite.dir === dir)
      ? 'large'
      : 'small';
  }
  // Refused rather than answered. Every other file would get `small` — a confident wrong answer, and the
  // budget is a ceiling, so the confident wrong answer is the permissive one.
  throw new Error(`sizeOf: ${file} is neither a test config nor a spec, so no budget applies to it`);
}

export function specFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? specFilesUnder(full) : entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}
