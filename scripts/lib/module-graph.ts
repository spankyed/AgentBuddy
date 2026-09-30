/**
 * What a file imports, and where that lands on disk — read from the syntax tree.
 *
 * **A relative specifier is a position in the tree, not a string that looks like a path.** Four checks
 * matched it with a regular expression, and measured against the compiler they agree about every real
 * import in this tree and invent 61 that do not exist: a fixture written as `"import { x } from './a.ts'"`
 * inside a spec is a string, and `'./local.ts'` in a test case is data. Those are inert only while none of
 * them happens to resolve, which is one fixture away from a bogus failure. In the other direction a
 * side-effect import — `import './register.ts'`, no `from` — is invisible to every one of those patterns,
 * and is an ordinary thing to write.
 *
 * So the specifiers come from the tree: import and export declarations including the side-effect form,
 * dynamic `import()`, and `require()`. The whole tree, not its top level, because a dynamic import is an
 * expression and sits wherever it was written.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

/** The extensions a relative specifier may have left off, in the order a resolver would try them */
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue', '/index.ts', '/index.js'];

/** Every relative module specifier in a file, as written, deduped */
export function relativeSpecifiers(absFile: string): string[] {
  const source = ts.createSourceFile(absFile, fs.readFileSync(absFile, 'utf-8'), ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const add = (node: ts.Node | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node) && node.text.startsWith('.')) found.add(node.text);
  };
  const visit = (node: ts.Node): void => {
    // `import x from './a'`, `import './a'` and `export * from './a'` all hang their specifier here
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found];
}

/**
 * Where a relative specifier lands, or `undefined` when nothing is there.
 *
 * Tries the extension the writer left off, and the `.ts` behind a `.js` this repo's source writes
 * (`rewriteRelativeImportExtensions`). A directory that shares a module's name resolves to its `index`,
 * which is why the bare candidate is checked for being a file rather than for existing.
 */
export function resolveRelative(fromFile: string, specifier: string,
  suffixes: readonly string[] = CANDIDATE_SUFFIXES): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [...suffixes.map((suffix) => base + suffix), base.replace(/\.js$/, '.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

/**
 * Every file the entries reach through relative imports, the entries included, confined to `within`.
 *
 * Confined, because the question is always "what does this body of code load" rather than "what exists" —
 * a walk that followed a spec into `src/` would answer about the product instead of the tests.
 */
export function reachableFrom(entries: readonly string[], within: readonly string[]): string[] {
  const inside = (file: string): boolean => within.some((dir) => file.startsWith(`${dir}${path.sep}`));
  const seen = new Set(entries);
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop()!;
    for (const specifier of relativeSpecifiers(file)) {
      const next = resolveRelative(file, specifier);
      if (next !== undefined && inside(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return [...seen].sort();
}
