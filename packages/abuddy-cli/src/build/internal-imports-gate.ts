// A pack's sources may name only the public API of the @abuddy packages. An export prefixed `_` is
// `@internal`: the app's own, which installed AgentBuddy is free to rename or drop, so a pack naming
// one builds today and breaks on an app update. The repo's own packs are checked by
// scripts/check-import-specifiers.ts; this is the same rule for every other pack, at build time.
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { parse as parseSfc } from 'vue/compiler-sfc';

const SOURCE_FILE = /(?<!\.d)\.(ts|tsx|mts|cts)$|\.vue$/;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__generated__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.isFile() && SOURCE_FILE.test(entry.name)) yield full;
  }
}

/** A file's code: the whole file, or a .vue file's <script> blocks with the line each starts on (less one) */
function codeBlocks(file: string, code: string): { content: string; lineOffset: number }[] {
  if (!file.endsWith('.vue')) return [{ content: code, lineOffset: 0 }];
  const { descriptor } = parseSfc(code, { filename: file });
  return [descriptor.script, descriptor.scriptSetup].filter((block) => block !== null)
    .map((block) => ({ content: block.content, lineOffset: block.loc.start.line - 1 }));
}

/** The module a static import or export, or a dynamic import(), names */
function moduleOf(node: ts.Node): string | undefined {
  const literal = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
    : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
  return literal && ts.isStringLiteralLike(literal) ? literal.text : undefined;
}

/** The internal names one node imports from an @abuddy package, by their imported (not local) name */
function internalNames(node: ts.Node): string[] {
  const internal = (names: string[], module: string) =>
    names.filter((name) => name.startsWith('_')).map((name) => `${name} from ${module}`);
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const module = moduleOf(node);
    if (!module?.startsWith('@abuddy/')) return [];
    const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
    if (!bindings || ts.isNamespaceImport(bindings) || ts.isNamespaceExport(bindings)) return [];
    return internal(bindings.elements.map((el) => (el.propertyName ?? el.name).text), module);
  }
  // `const { _x } = await import('@abuddy/…')`
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
    const call = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
    const module = moduleOf(call);
    if (!module?.startsWith('@abuddy/')) return [];
    return internal(node.name.elements.map((el) => (el.propertyName ?? el.name).getText()), module);
  }
  return [];
}

/**
 * `file:line: name from module` for each host-only export the pack's `src/` names. Generated files
 * are the generator's output and are skipped, as is a namespace import's property access
 * (`import * as u`, then `u._x()`), which naming alone can't see.
 */
export function internalImportProblems(packDir: string): string[] {
  const src = path.join(packDir, 'src');
  if (!fs.existsSync(src)) return [];
  const problems: string[] = [];
  for (const file of sourceFiles(src)) {
    const code = fs.readFileSync(file, 'utf-8');
    // Only files that name an @abuddy package are worth parsing
    if (!code.includes('@abuddy/')) continue;
    for (const { content, lineOffset } of codeBlocks(file, code)) {
      const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        for (const name of internalNames(node)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + lineOffset;
          problems.push(`${path.relative(packDir, file).split(path.sep).join('/')}:${line}: ${name}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return problems;
}
