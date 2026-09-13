import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * The app imports every @abuddy/ui module at startup to share it with packs (virtual:host-deps),
 * so a module must not act when imported: no top-level statements that run code (listeners,
 * registrations). Declarations, including objects built from calls, are fine; `<script setup>`
 * runs per component instance and isn't checked.
 */
const UI_SRC = path.join(REPO_ROOT, 'packages', 'abuddy-ui', 'src');

function modules(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return modules(full);
    return /(?<!\.d|\.spec|\.test)\.ts$|\.vue$/.test(entry.name) ? [full] : [];
  });
}

/** `file:line: statement` for each top-level statement that runs when the module is imported */
function importTimeStatements(file: string): string[] {
  let code = fs.readFileSync(file, 'utf-8');
  let lineOffset = 0;
  if (file.endsWith('.vue')) {
    const script = parse(code, { filename: file }).descriptor.script;
    if (!script) return [];
    code = script.content;
    lineOffset = script.loc.start.line - 1;
  }
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  return source.statements
    .filter((statement) => ts.isExpressionStatement(statement) || ts.isIfStatement(statement) || ts.isForStatement(statement)
      || ts.isForOfStatement(statement) || ts.isTryStatement(statement) || ts.isBlock(statement))
    .map((statement) => {
      const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1 + lineOffset;
      return `${path.relative(UI_SRC, file)}:${line}: ${statement.getText(source).split('\n')[0]}`;
    });
}

describe('@abuddy/ui modules', () => {
  it('do nothing when imported', () => {
    expect(modules(UI_SRC).flatMap(importTimeStatements)).toEqual([]);
  });
});
