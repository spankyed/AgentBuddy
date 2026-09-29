import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { INTEGRATION_SUITES } from '../../../scripts/lib/chain-steps.ts';
import { specFilesUnder } from '../../../scripts/lib/test-timeouts.ts';

/**
 * Which integration specs spawn a compiler, and why the count must not creep.
 *
 * The pooled integration run caps itself below one worker per core, because a worker per core oversubscribes
 * the box and the main thread misses birpc's 60s window — a flake, and one vitest hardcodes so no config can
 * lengthen. The cap is a **proxy**: what needs bounding is concurrent compilers and what is bounded is test
 * workers, so every spec pays for the few that spawn.
 *
 * A spawn is worth about a second: removing two from one file moved the pooled run's median from 49.1s to
 * 48.2s, measured over five runs each on an idle machine. The reason to hold the line is not that second.
 * It is that **this suite's failure mode is contention** — the birpc timeout above appeared three times in
 * this session, every one of them while another workload shared the box, and not once in nineteen quiet
 * runs. Subprocess compilers are what make a suite sensitive to a machine that is already busy, which a
 * developer's machine usually is. This is the check that keeps the count from drifting up unnoticed.
 *
 * It reads the **AST**, not the text: a call expression whose callee is a spawning function, whose arguments
 * name a compiler. A grep over these files matches the word `tsc` in prose — the root `CLAUDE.md` keeps the
 * rule, and this file would have been its next example.
 */

/** The functions that start a process here, including the per-file `run` helpers that wrap them */
const SPAWNERS = new Set(['execFileSync', 'execSync', 'spawnSync', 'exec', 'spawn', 'run']);
/** What makes a spawn a *compiler* spawn: the binaries whose cost this is about */
const COMPILERS = /\b(tsc|vue-tsc|TSC_VERSIONS)\b/;

/**
 * Every integration spec that spawns a compiler, derived from the tree.
 *
 * Exported shape rather than a constant so a case can run it over a mutated exception list: a rule whose
 * population is a walk cannot be fictional, and one whose exceptions are data can be watched failing.
 */
function spawnsCompilerIn(file: string): boolean {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ts.isIdentifier(node.expression) ? node.expression.text : '';
      // The arguments only — the callee's own name never contains a compiler, and reading the whole call
      // would match a variable named after what it holds rather than what is run
      if (SPAWNERS.has(callee) && node.arguments.some((arg) => COMPILERS.test(arg.getText(source)))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every integration spec in the repo, from the suites that have an expensive half */
const integrationSpecs = (): string[] => INTEGRATION_SUITES
  .flatMap((suite) => specFilesUnder(path.join(REPO_ROOT, 'packages', suite.dir, 'tests')))
  .filter((file) => file.endsWith('.integration.spec.ts'))
  .map((file) => path.relative(REPO_ROOT, file))
  .sort();

/**
 * The spawns that stay, each with why it cannot be the in-process call the others became.
 *
 * An entry that stops naming a spec that spawns is dead text reading as coverage, which the case below
 * fails on — the same rule `check:repro`'s exception list is held to.
 */
const ALLOWED: Record<string, string> = {
  'packages/abuddy-cli/tests/commands/add-extensions.integration.spec.ts':
    'vue-tsc needs the Vue language service, which ts.createProgram is not',
  'packages/repo-checks/tests/component-contracts.integration.spec.ts':
    'vue-tsc again, and it emits declarations for the component reports rather than only checking them',
  'packages/publish-checks/tests/published-exports.integration.spec.ts':
    'CONSUMER_MATRIX compiles a consumer with each supported TypeScript, and the subprocess is the fidelity: '
    + 'running the 5.7 floor in-process would put two typescript instances in one process',
};

describe('an integration spec spawns a compiler only where it must', () => {
  const specs = integrationSpecs();

  it('reads a real population, so the cases below are about something', () => {
    expect(specs.length, 'no integration specs were found').toBeGreaterThan(10);
  });

  it('names every spawn that exists', () => {
    const spawning = specs.filter((file) => spawnsCompilerIn(path.join(REPO_ROOT, file)));
    expect(spawning, 'a new compiler spawn makes the pooled run slower and flakier, and the worker cap is '
      + 'already paying for the ones there are. Make it in-process (typecheckPack) or add it to ALLOWED '
      + 'with the reason it cannot be').toEqual(Object.keys(ALLOWED).sort());
  });

  // An exception naming a file that no longer spawns is text that reads as coverage. Both directions, because
  // a stale entry and a missing one fail differently and only one of them is loud
  it('lists no exception that has stopped applying', () => {
    for (const [file, why] of Object.entries(ALLOWED)) {
      expect(fs.existsSync(path.join(REPO_ROOT, file)), file).toBe(true);
      expect(spawnsCompilerIn(path.join(REPO_ROOT, file)), `${file} no longer spawns — drop its entry`).toBe(true);
      expect(why.length, `${file} needs a reason, not a name`).toBeGreaterThan(20);
    }
  });

  // The list is data, so the check can be watched failing on every run for microseconds: drop an entry from a
  // copy and the answer has to flip
  it('fails when an allowed spawn is not allowed', () => {
    const withoutOne = Object.keys(ALLOWED).slice(1);
    const spawning = specs.filter((file) => spawnsCompilerIn(path.join(REPO_ROOT, file)));
    expect(spawning).not.toEqual(withoutOne);
  });

  // The detector reads calls, not prose: this file says `tsc` a dozen times and spawns nothing
  it('does not read a mention as a spawn', () => {
    expect(spawnsCompilerIn(path.join(REPO_ROOT, 'packages/repo-checks/tests/no-spawned-compilers.spec.ts'))).toBe(false);
  });
});
