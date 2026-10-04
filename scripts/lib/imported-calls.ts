/**
 * Which imported functions a file actually calls, read from its syntax tree.
 *
 * **"The name appears in the text" is not "the code calls it", and both directions bite.** A check over
 * `chain-table.spec.ts`'s step runners asked whether a runner's source *mentioned* one of four stamp-reading
 * functions. That is a false positive for any module which merely imports something that mentions one —
 * `scripts/bounded.ts` importing the step table put three steps in the answer, each then needing an
 * exception saying the name was "in its reach without being in its behaviour" — and a false negative for a
 * stamp reader nobody put on the list.
 *
 * `process-spawns.ts` had already been through this once, from the other end: a check that read a call's
 * argument text and its callee against a hand-written list "reported three spawning specs where there are
 * twelve". What fixed it was asking the tree, which is what this does, generalised so the two checks share
 * one walk rather than one of them keeping a private copy.
 *
 * **A binding, never a bare name.** A call only counts where the name was imported in that file, so a local
 * helper that happens to share a name with a stamp reader is not one. That is also what makes an import
 * with no call the honest zero: importing a module is not using it.
 *
 * Three things it does not see, all cheaper to record than to detect: `require()`, a dynamic
 * `await import()`, and a re-export, whose caller binds the name from somewhere else.
 */
import * as fs from 'node:fs';
import ts from 'typescript';

/** Which bindings to count, and from where. An empty query counts every imported call in the file. */
export interface CallQuery {
  /**
   * Only bindings imported from one of these specifiers, as written.
   *
   * For a module where every export is the thing being looked for — `child_process` and its spawners — this
   * is the whole question, and no name has to be listed.
   */
  readonly fromModules?: ReadonlySet<string>;
  /**
   * Only these names, whatever module they came from.
   *
   * For a module where only some exports are the thing being looked for, which is the stamp readers: three
   * of `packages-built.ts`'s exports read a stamp store and the rest do not, so the population cannot come
   * from the specifier and is declared beside the functions instead (`STAMP_READERS`).
   */
  readonly names?: ReadonlySet<string>;
}

/** What a file bound from the modules in scope: names callable directly, and namespaces callable through */
function boundFrom(source: ts.SourceFile, fromModules?: ReadonlySet<string>):
{ names: Set<string>; namespaces: Set<string> } {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  source.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    if (fromModules !== undefined && !fromModules.has(node.moduleSpecifier.text)) return;
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
 * The matching calls in one file, each as the name it was called through (`execFileSync`, `cp.spawn`).
 *
 * Empty for a file that imports and never calls, which is the answer the text check could not give.
 */
export function importedCallsIn(absFile: string, query: CallQuery = {}): string[] {
  const source = ts.createSourceFile(absFile, fs.readFileSync(absFile, 'utf-8'), ts.ScriptTarget.Latest, true);
  const { names, namespaces } = boundFrom(source, query.fromModules);
  if (names.size === 0 && namespaces.size === 0) return [];
  // A namespace import is matched on the property, since that is the export being called: `wanted` asks
  // about `unitStaleReason`, and `pb.unitStaleReason()` is a call of it however the namespace is spelled
  const wanted = (name: string): boolean => query.names === undefined || query.names.has(name);

  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && names.has(callee.text) && wanted(callee.text)) calls.push(callee.text);
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        && namespaces.has(callee.expression.text) && wanted(callee.name.text)) {
        calls.push(`${callee.expression.text}.${callee.name.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}
