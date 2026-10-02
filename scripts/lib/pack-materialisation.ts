/**
 * Where a test writes a pack manifest by hand, read from its syntax tree.
 *
 * `@app/pack-fixtures` exists so that one place decides what a pack on disk looks like, and a fixture too
 * thin for a rule to fire is a case that passes because it could not fail. That only holds while specs ask
 * for a pack rather than assembling one, so this is the check that they do.
 *
 * **The predicate is read, not matched.** The lesson is `process-spawns.ts`', which replaced a check that
 * asked whether a call's *argument text* matched a pattern and reported three spawning files where there are
 * twelve. So the write functions come from each file's own `node:fs` import however it is spelled, and what
 * makes a call a finding is the *shape* of what it writes: `JSON.stringify` of an object literal that
 * declares an `id`. Nothing here is named.
 *
 * **That shape is the line between a fixture and the four things that are not one**, each of which this must
 * leave alone and does, by construction rather than by exemption:
 *
 * - a `'{}'` **discovery marker**, where a directory holding *any* manifest is the subject — the written
 *   value is a string, not a stringified object;
 * - a **patch** of a pack something else scaffolded — the value is an identifier the file read back, so there
 *   is no object literal to see;
 * - a **manifest that is the subject**, handed to a local `writeManifest(dir, manifest)` — an identifier
 *   again, and the pack tree the command reads is not what the case is about;
 * - the **installed shape** (a manifest beside `integrity.json` and a snapshot), which is `@abuddy/host`'s
 *   artifact and whose layout host owns.
 *
 * **Who it polices derives from the manifest**: the packages that declare `@app/pack-fixtures`. A package
 * that reaches for the fixture opts into the rule in the same edit, and a layer or a pack — which may not
 * import an `@app/*` package at all — is never asked to do something it cannot.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { PACKAGE_DIRS } from './workspace-deps.ts';

/** The fixture package, named once: the dependency that opts a package into this rule */
export const PACK_FIXTURES = '@app/pack-fixtures';

/** However the module is spelled */
const NODE_FS = new Set(['node:fs', 'fs', 'node:fs/promises', 'fs/promises']);

/** What a file bound from `fs`: names callable directly, and namespaces callable through */
function boundFrom(source: ts.SourceFile): { names: Set<string>; namespaces: Set<string> } {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  source.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    if (!NODE_FS.has(node.moduleSpecifier.text)) return;
    const bindings = node.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) for (const element of bindings.elements) names.add(element.name.text);
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (node.importClause?.name !== undefined) namespaces.add(node.importClause.name.text);
  });
  return { names, namespaces };
}

/** A call of something this file bound from `fs` — `writeFileSync(…)` or `fs.writeFileSync(…)` alike */
const isFsCall = (node: ts.CallExpression, bound: { names: Set<string>; namespaces: Set<string> }): boolean =>
  (ts.isIdentifier(node.expression) && bound.names.has(node.expression.text))
  || (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
    && bound.namespaces.has(node.expression.expression.text));

/** Every string literal anywhere inside a node: how `path.join(dir, 'abuddy.json')` names its file */
function literalsIn(node: ts.Node): string[] {
  const found: string[] = [];
  const walk = (child: ts.Node): void => {
    if (ts.isStringLiteral(child)) found.push(child.text);
    child.forEachChild(walk);
  };
  walk(node);
  return found;
}

/** `JSON.stringify({ id: … })` — a manifest built here, as against one read back or handed in */
function writesAManifestLiteral(argument: ts.Node | undefined): boolean {
  if (argument === undefined || !ts.isCallExpression(argument)) return false;
  const { expression } = argument;
  const isStringify = ts.isPropertyAccessExpression(expression) && expression.name.text === 'stringify'
    && ts.isIdentifier(expression.expression) && expression.expression.text === 'JSON';
  if (!isStringify) return false;
  const [value] = argument.arguments;
  if (value === undefined || !ts.isObjectLiteralExpression(value)) return false;
  return value.properties.some((property) => property.name !== undefined
    && ts.isIdentifier(property.name) && property.name.text === 'id');
}

/** A hand-written pack manifest: `file:line`, repo-relative */
export interface HandWrittenManifest { readonly file: string; readonly line: number }

/** Every place `source` writes a manifest it built inline */
export function handWrittenManifests(source: string, file = 'fixture.ts'): HandWrittenManifest[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const bound = boundFrom(parsed);
  if (bound.names.size === 0 && bound.namespaces.size === 0) return [];
  const found: HandWrittenManifest[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isFsCall(node, bound)
      && literalsIn(node.arguments[0] ?? node).includes('abuddy.json')
      && writesAManifestLiteral(node.arguments[1])) {
      found.push({ file, line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1 });
    }
    node.forEachChild(walk);
  };
  walk(parsed);
  return found;
}

/** The packages whose tests this rule reads: the ones that declare the fixture */
export function packagesUsingFixtures(root = REPO_ROOT): string[] {
  return PACKAGE_DIRS.filter((dir) => {
    const manifest = path.join(root, 'packages', dir, 'package.json');
    if (!fs.existsSync(manifest)) return false;
    const { dependencies = {}, devDependencies = {} } = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as
      { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return PACK_FIXTURES in { ...dependencies, ...devDependencies };
  }).sort();
}

/** Every test file this rule reads, repo-relative */
export function testFilesPoliced(root = REPO_ROOT): string[] {
  return packagesUsingFixtures(root).flatMap((dir) => {
    const tests = path.join(root, 'packages', dir, 'tests');
    if (!fs.existsSync(tests)) return [];
    return fs.readdirSync(tests, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
  }).sort();
}
