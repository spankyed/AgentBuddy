/**
 * Where a test file starts a subprocess, read from its syntax tree.
 *
 * **The question is what a file can do, not what its arguments say.** The check this replaces asked whether
 * a call's argument text matched `/\b(tsc|vue-tsc|TSC_VERSIONS)\b/` and whether its callee was in a
 * hand-written list of spawner names. Both halves were wrong on the tree they shipped against: it reported
 * three spawning specs where there are twelve, and the one it caught was the cheapest of them. It missed a
 * spec running `node <CLI> build` twice (no compiler in the argument text), one calling
 * `spawnSync(command, …)` through a variable (nothing to match), and `execFile`, which the list omitted
 * while carrying both other sync/async pairs.
 *
 * So nothing here is named. The names come from the `child_process` import in each file, however it is
 * spelled, and a spawn is a call of one of them. Hoisting a binary path into a const, renaming a helper and
 * reaching for a different `child_process` export all stop mattering, because none of them is what is read.
 *
 * **A file is named for holding a call, not for reaching one.** `tests/_support/pack-builds.ts` exports a
 * `run` that spawns, so it is named once rather than fanning out to every spec that imports it — measured,
 * that fan-out over-collects, because most importers want the in-process `callCli` and never spawn. The
 * cost is that a spec calling `run` is not itself named; what it imports is, which is where the call is.
 *
 * Three things it does not see, none of them present in this tree, all cheaper to record than to detect:
 * `require('child_process')`, a dynamic `await import('node:child_process')`, and a re-export
 * (`export { spawn } from 'node:child_process'`), whose caller binds the name from somewhere else.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

/** However the module is spelled */
const CHILD_PROCESS = new Set(['node:child_process', 'child_process']);

/** What a file bound from `child_process`: names callable directly, and namespaces callable through */
function boundFrom(source: ts.SourceFile): { names: Set<string>; namespaces: Set<string> } {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  source.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    if (!CHILD_PROCESS.has(node.moduleSpecifier.text)) return;
    const bindings = node.importClause?.namedBindings;
    // `import { execFileSync }` and `import { execFileSync as run }` alike: the local name is what is called
    if (bindings !== undefined && ts.isNamedImports(bindings)) for (const element of bindings.elements) names.add(element.name.text);
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    // A default import of a CJS module is the namespace under another name
    if (node.importClause?.name !== undefined) namespaces.add(node.importClause.name.text);
  });
  return { names, namespaces };
}

/**
 * The spawn calls in one file, each as the name it was called through (`execFileSync`, `cp.spawn`).
 *
 * Empty for a file that imports `child_process` and never calls it, which is the honest answer: an import
 * is not a subprocess, and a file that only re-exports a type from it is not a spawner.
 */
export function spawnCallsIn(absFile: string): string[] {
  const source = ts.createSourceFile(absFile, fs.readFileSync(absFile, 'utf-8'), ts.ScriptTarget.Latest, true);
  const { names, namespaces } = boundFrom(source);
  if (names.size === 0 && namespaces.size === 0) return [];

  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && names.has(callee.text)) calls.push(callee.text);
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text)) {
        calls.push(`${callee.expression.text}.${callee.name.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/** Every `.ts` under a directory — the whole tree, not only its specs: a support module is where a spawn hides */
export function tsFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? tsFilesUnder(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** The relative import and export specifiers in one file */
function relativeSpecifiers(source: ts.SourceFile): string[] {
  const out: string[] = [];
  source.forEachChild((node) => {
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier : undefined;
    if (specifier !== undefined && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) out.push(specifier.text);
  });
  return out;
}

/** Where a relative specifier lands, allowing for the `.ts` this repo writes and the `.js` it does not */
function resolveRelative(from: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, path.join(base, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

/**
 * Every file the entries reach through relative imports, the entries included, confined to `within`.
 *
 * What the integration pool actually loads, which is the population a rule about that pool has to be about.
 * Without it the answer includes every fast spec in the same packages — `lint-scope`, `with-source`, a
 * dozen more — which spawn freely and run in another pool where no cap is at stake, and excludes nothing
 * that matters. It is also how `_support/pack-builds.ts` is in and `_support/repo-files.ts` is out, the two
 * sitting one directory apart.
 */
export function reachableFrom(entries: readonly string[], within: readonly string[]): string[] {
  const inside = (file: string) => within.some((dir) => file.startsWith(`${dir}${path.sep}`));
  const seen = new Set(entries);
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop()!;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);
    for (const specifier of relativeSpecifiers(source)) {
      const next = resolveRelative(file, specifier);
      if (next !== undefined && inside(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return [...seen].sort();
}

/** A file that starts a subprocess, and how */
export interface SpawnSite {
  /** Repo-relative, so it can be compared against a recorded list */
  readonly file: string;
  /** The names the calls went through, deduped and sorted */
  readonly through: readonly string[];
  /** How many call sites, which is what creeps */
  readonly count: number;
}

/**
 * Which of the given files start a subprocess.
 *
 * Takes the files rather than deriving them, so a caller can run it over a population of its own — which is
 * how the rule gets a mutation case that changes the *input* instead of the expectation it compares against.
 */
export function spawnSitesIn(files: readonly string[], root: string): SpawnSite[] {
  return files
    .map((file) => ({ file, calls: spawnCallsIn(file) }))
    .filter(({ calls }) => calls.length > 0)
    .map(({ file, calls }) => ({
      file: path.relative(root, file),
      through: [...new Set(calls)].sort(),
      count: calls.length,
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}
