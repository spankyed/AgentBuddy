import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A checkout's @abuddy/testing loads its source only under the @abuddy/source condition; without
 * it (e.g. `npx playwright test`) it resolves to src/requires-source.ts, which fails with the fix.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TESTING_SRC = path.join(REPO_ROOT, 'packages', 'abuddy-testing', 'src');

/** Names a module exports at runtime (types excluded) */
function runtimeExports(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  for (const statement of source.statements) {
    const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      names.push(...statement.exportClause.elements.filter((e) => !e.isTypeOnly).map((e) => e.name.text));
    } else if (exported && ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(statement.name.text);
    } else if (exported && ts.isVariableStatement(statement)) {
      names.push(...statement.declarationList.declarations.map((d) => (d.name as ts.Identifier).text));
    }
  }
  return names.sort();
}

function importTesting(conditions: string[]) {
  return spawnSync(process.execPath, [...conditions, '--input-type=module', '-e', "console.log(import.meta.resolve('@abuddy/testing')); await import('@abuddy/testing')"], {
    cwd: REPO_ROOT, env: { PATH: process.env.PATH }, encoding: 'utf-8',
  });
}

describe('@abuddy/testing in a checkout', () => {
  it('fails with the fix when loaded without the @abuddy/source condition', () => {
    const result = importTesting([]);
    expect(result.stdout).toContain('packages/abuddy-testing/src/requires-source.ts');
    expect(result.stderr).toMatch(/needs the @abuddy\/source condition\. In the checkout run Playwright through `npm test -- <args>`/);
  });

  it('resolves to the fixture source with the condition', () => {
    const resolved = spawnSync(process.execPath, ['--conditions=@abuddy/source', '--input-type=module', '-e', "console.log(import.meta.resolve('@abuddy/testing'))"], {
      cwd: REPO_ROOT, env: { PATH: process.env.PATH }, encoding: 'utf-8',
    });
    expect(resolved.stdout.trim()).toMatch(/packages\/abuddy-testing\/src\/index\.ts$/);
  });

  it('declares every runtime export of the fixture, so importers link before the error', () => {
    expect(runtimeExports(path.join(TESTING_SRC, 'requires-source.ts'))).toEqual(runtimeExports(path.join(TESTING_SRC, 'index.ts')));
  });
});
