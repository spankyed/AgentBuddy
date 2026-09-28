// The lint gate's one exclusion, and whether anything holds it there.
//
// `lint:check` lints `packages/` since 8549f81a5, with a single exclusion: the CLI's scaffold templates. Their
// parameter names are what a pack author reads when they open their first action, so `params`, `services`, `z`
// and `flowId` are documentation there rather than unused bindings.
//
// That exclusion is a pattern in `package.json`, and before this spec nothing read it. The failure it prevents is
// not hypothetical — it happened, in this order: the templates' four parameters were renamed to `_params`,
// `_services`, `_z`, `_flowId`, taking oxlint's own advice ("Unused parameters should start with a '_'"); that
// broke `add-extensions.integration.spec.ts` and the chain, and shipped a scaffold whose whole API surface was
// underscore-prefixed in a repo where `_` means @internal and host-only; it was reverted; then the exclusion was
// added. `chain-inputs.spec.ts` does not catch a deletion of it, because `typecheck` declares `templates` among
// its inputs either way.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

const TEMPLATES = 'packages/abuddy-cli/templates/';

/** Arguments that take the next token as a value, so it is never read as a target */
const VALUED = new Set(['-D', '--deny', '-A', '--allow', '-W', '--warn', '-c', '--config', '--ignore-path', '--ignore-pattern']);

const rootScripts = (): Record<string, string> =>
  (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }).scripts ?? {};

/**
 * The `oxlint` call inside a root script, as a token list. Derived from the script rather than restated, so
 * narrowing the lint scope narrows what this checks; a script with no such call fails by name rather than
 * passing over whatever it did not understand.
 */
function oxlintArgs(script: string): string[] {
  const command = rootScripts()[script];
  expect(command, `there is no root \`${script}\` script for this to read`).toBeDefined();
  const call = command!.split('&&').find((clause) => /(^|\s)oxlint(\s|$)/.test(clause));
  expect(call, `\`${script}\` spells no oxlint call, so the gate this checks is somewhere else now`).toBeDefined();
  const tokens = call!.trim().split(/\s+/);
  return tokens.slice(tokens.indexOf('oxlint') + 1).map((token) => token.replace(/^['"]|['"]$/g, ''));
}

/** The `--ignore-pattern` values of a script's oxlint call */
const ignorePatterns = (script: string): string[] =>
  oxlintArgs(script).filter((arg, index, args) => args[index - 1] === '--ignore-pattern' && !VALUED.has(arg));

/**
 * The files oxlint reports on, run exactly as the gate runs it: from the repo root, over `.`. Linting the
 * template directory directly would report nothing about the exclusion, because oxlint resolves an ignore
 * pattern against the *linted root* — the reason the gate lints `.` at all (7080ebfe7).
 *
 * A non-zero exit is what a finding looks like, so the output is read either way and only an unparseable one
 * fails here.
 */
function reportedFiles(args: readonly string[]): string[] {
  let stdout = '';
  try {
    stdout = execFileSync(path.join(REPO_ROOT, 'node_modules', '.bin', 'oxlint'), [...args, '-f', 'json'],
      { cwd: REPO_ROOT, stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 }).toString();
  } catch (error) {
    stdout = String((error as { stdout?: Buffer }).stdout ?? '');
  }
  const parsed = JSON.parse(stdout) as { diagnostics?: { filename?: string }[] };
  return (parsed.diagnostics ?? []).map((diagnostic) => diagnostic.filename ?? '');
}

const underTemplates = (files: readonly string[]): string[] => files.filter((file) => file.startsWith(TEMPLATES));

describe("the lint gate's scaffold exclusion", () => {
  /**
   * Asserted over the templates alone rather than the whole report: an unrelated finding somewhere else in the
   * repo is the gate's business to fail on, not this one's, and a case that demanded a clean tree would fail for
   * a reason that has nothing to do with what it is named after.
   */
  it('reports nothing in the scaffold templates', () => {
    expect(underTemplates(reportedFiles(oxlintArgs('lint:check')))).toEqual([]);
  });

  /**
   * The mutation, on the real pattern list with the real linter: drop the one pattern and the templates are
   * reported again. This is what makes the case above mean something — without it, "no findings here" is equally
   * true of a pattern that excludes the wrong directory, of a linter that reads nothing, and of a scaffold with
   * nothing to report.
   */
  it('reports them once that exclusion is dropped, which is what makes it load-bearing', () => {
    const kept = oxlintArgs('lint:check').filter((arg, index, args) =>
      !(arg.startsWith(TEMPLATES) && args[index - 1] === '--ignore-pattern') && !(args[index + 1]?.startsWith(TEMPLATES) && arg === '--ignore-pattern'));
    expect(kept, 'no argument was dropped, so this ran the unmutated gate and proves nothing')
      .not.toEqual(oxlintArgs('lint:check'));
    expect(underTemplates(reportedFiles(kept)),
      'the scaffold templates offend no lint rule, so excluding them protects nothing').not.toEqual([]);
  });

  /**
   * `lint:fix` is the same call plus `--fix`, and it is the half that would actually re-break the scaffold: one
   * missing the exclusion does not *report* the templates, it rewrites them — restoring the underscores
   * automatically, and silently.
   */
  it('excludes them from lint:fix too, which would otherwise rewrite them', () => {
    expect(ignorePatterns('lint:check'), 'the gate excludes nothing, so both halves agreeing says nothing').not.toEqual([]);
    expect([...ignorePatterns('lint:fix')].sort()).toEqual([...ignorePatterns('lint:check')].sort());
  });
});
