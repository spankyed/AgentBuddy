// @abuddy/sdk, @abuddy/host and @abuddy/ui import their own modules by source file name
// (`./query.ts`); tsc and tsdown write `.js` into the output. Fails on a relative `.js`
// specifier that names a TypeScript module (`.js` → .ts/.tsx, `.mjs` → .mts, `.cjs` → .cts), in
// TypeScript files and .vue <script> blocks. Covers imports, re-exports, dynamic imports, import
// types, `import x = require()`, require() and module-path calls like vi.mock(). Imports of
// hand-written declarations (`./speech-event.js` → speech-event.d.ts) have no source and are fine.
// Extensionless imports already fail the packages' nodenext typecheck.
//
//   tsx scripts/check-import-specifiers.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from '@vue/compiler-sfc';

const repoRoot = path.resolve(import.meta.dirname, '..');
export const CHECKED_DIRS = [
  'packages/abuddy-sdk/src', 'packages/abuddy-sdk/tests', 'packages/abuddy-sdk/scripts',
  'packages/abuddy-host/src', 'packages/abuddy-host/tests',
  'packages/abuddy-ui/src', 'packages/abuddy-ui/scripts',
];

/** Emitted extension → the source extensions that compile to it */
const SOURCE_EXTENSIONS: Record<string, string[]> = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };
/** Calls whose first argument is a module path */
const MODULE_PATH_CALLS = /^(require|require\.resolve|(vi|jest)\.(mock|doMock|unmock|importActual|importMock))$/;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.isFile() && /(?<!\.d)\.(ts|tsx|mts|cts)$|\.vue$/.test(entry.name)) yield full;
  }
}

/** Relative specifiers in a module: every static and dynamic form that names a module path. */
function specifiers(code: string, fileName: string): { text: string; line: number }[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const found: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    let literal: ts.StringLiteralLike | undefined;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) literal = node.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) literal = node.moduleReference.expression;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) literal = node.argument.literal;
    else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || MODULE_PATH_CALLS.test(node.expression.getText(source)))) {
      literal = node.arguments[0];
    }
    if (literal && /^\.\.?\//.test(literal.text)) {
      found.push({ text: literal.text, line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `file:line: specifier` for each relative emitted-extension specifier that names a TypeScript module. */
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
          const emitted = path.extname(text);
          const base = path.resolve(path.dirname(file), text.slice(0, -emitted.length));
          if ((SOURCE_EXTENSIONS[emitted] ?? []).some((ext) => fs.existsSync(`${base}${ext}`))) {
            problems.push(`${path.relative(root, file)}:${line + lineOffset}: ${text}`);
          }
        }
      }
    }
  }
  return problems;
}

/** Pack sources and the pack templates the CLI writes, which use the generated facades */
export const PACK_SOURCE_DIRS = [
  'packages/default-setup/src', 'tests/fixtures/external-pack/src', 'tests/fixtures/bundled-ui-pack/src',
  'packages/abuddy-cli/src/commands/add', 'packages/abuddy-cli/src/commands/init.ts',
];

/** Helpers packs get typed from #generated/events and #generated/repository instead */
const RAW_PACK_HELPERS: Record<string, string[]> = {
  '@abuddy/sdk/helpers': ['emit', 'sendToPlugin'],
  '@abuddy/sdk/services': ['emit', 'sendToPlugin'],
  '@abuddy/sdk/ears': ['registerRepository'],
};

/**
 * `file:line: name from module` for each untyped event helper or repository registration a pack
 * source imports (also inside template strings, which the CLI writes as pack source). Generated
 * files are exempt.
 */
export function findRawPackHelpers(dirs = PACK_SOURCE_DIRS, root = repoRoot): string[] {
  const problems: string[] = [];
  const files = dirs.flatMap((dir) => {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) return [];
    return fs.statSync(full).isFile() ? [full] : [...sourceFiles(full)];
  }).filter((file) => !file.split(path.sep).includes('__generated__'));
  const importPattern = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf-8');
    for (const match of code.matchAll(importPattern)) {
      const names = RAW_PACK_HELPERS[match[2]];
      if (!names) continue;
      const imported = match[1].split(',').map((item) => item.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]);
      for (const name of imported.filter((n) => names.includes(n))) {
        const line = code.slice(0, match.index).split('\n').length;
        problems.push(`${path.relative(root, file)}:${line}: ${name} from ${match[2]}`);
      }
    }
  }
  return problems;
}

// Run as a script, also through a symlinked path (tests import findJsSpecifiers)
if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) {
  const problems = findJsSpecifiers();
  if (problems.length > 0) {
    console.error(`Relative imports must name the TypeScript source (tsc and tsdown emit .js):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const rawHelpers = findRawPackHelpers();
  if (rawHelpers.length > 0) {
    console.error(`Pack code uses the typed facades: emit and sendToPlugin from #generated/events, repositories declared in abuddy.json:\n  ${rawHelpers.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Relative import specifiers name .ts sources');
}
