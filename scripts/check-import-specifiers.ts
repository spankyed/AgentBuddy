// @abuddy/sdk, @abuddy/host and @abuddy/ui import their own modules by source file name
// (`./query.ts`); tsc and tsdown write `.js` into the output. Fails on a relative `.js`
// specifier that names a .ts module, in .ts files and .vue <script> blocks. Imports of
// hand-written declarations (`./speech-event.js` → speech-event.d.ts) have no .ts source and
// are fine. Extensionless imports already fail the packages' nodenext typecheck.
//
//   tsx scripts/check-import-specifiers.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from '@vue/compiler-sfc';

const repoRoot = path.resolve(import.meta.dirname, '..');
export const CHECKED_DIRS = ['packages/abuddy-sdk/src', 'packages/abuddy-sdk/tests', 'packages/abuddy-host/src', 'packages/abuddy-host/tests', 'packages/abuddy-ui/src'];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/(?<!\.d)\.ts$|\.vue$/.test(entry.name)) yield full;
  }
}

/** Relative specifiers in a module: imports, re-exports, dynamic imports and import types. */
function specifiers(code: string, fileName: string): { text: string; line: number }[] {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    let literal: ts.StringLiteralLike | undefined;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) literal = node.moduleSpecifier;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) literal = node.argument.literal;
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) literal = node.arguments[0];
    if (literal && /^\.\.?\//.test(literal.text)) {
      found.push({ text: literal.text, line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `file:line: specifier` for each relative `.js` specifier that names a .ts module. */
export function findJsSpecifiers(dirs = CHECKED_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  for (const dir of dirs) {
    for (const file of sourceFiles(path.join(root, dir))) {
      const code = fs.readFileSync(file, 'utf-8');
      const blocks = file.endsWith('.vue')
        ? (() => {
          const { descriptor } = parseSfc(code, { filename: file });
          return [descriptor.script, descriptor.scriptSetup].filter((b) => b !== null)
            .map((b) => ({ content: b.content, lineOffset: b.loc.start.line - 1 }));
        })()
        : [{ content: code, lineOffset: 0 }];
      for (const { content, lineOffset } of blocks) {
        for (const { text, line } of specifiers(content, file)) {
          if (!text.endsWith('.js')) continue;
          const base = path.resolve(path.dirname(file), text.slice(0, -'.js'.length));
          if (fs.existsSync(`${base}.ts`)) problems.push(`${path.relative(root, file)}:${line + lineOffset}: ${text}`);
        }
      }
    }
  }
  return problems;
}

if (import.meta.filename === process.argv[1]) {
  const problems = findJsSpecifiers();
  if (problems.length > 0) {
    console.error(`Relative imports must name the .ts source (tsc and tsdown emit .js):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Relative import specifiers name .ts sources');
}
