/**
 * Where a test writes a pack manifest by hand, read from its syntax tree.
 *
 * `packFixture` exists so that one place decides what a pack on disk looks like, and a fixture too thin for a
 * rule to fire is a case that passes because it could not fail. That only holds while specs ask for a pack
 * rather than assembling one, so this is the check that they do.
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
 * **Who it polices is the packages whose tests reach for the fixture**, derived by reading their imports,
 * minus the package that publishes it (`FIXTURE_PACKAGE`). A package that adopts it opts into the rule in the
 * same edit, and the rule's subject is what it can actually be: that no package writes a pack tree both ways.
 *
 * **It is deliberately not every package that *could* import it.** `packFixture` is a source-only export of
 * `@abuddy/sdk`, so every host-layer package can resolve it, and asking all of them was measured on
 * 2026-10-02: 23 findings, 20 in `@abuddy/host` and 3 in `packages/api`, and **every one of them deserves to
 * be hand-written**. They write a *data dir's* installed pack (`packs/<id>/abuddy.json`, whose subject is
 * discovery, staging or an update check) or a built built-in (`dist/runtime/index.cjs` and no source at all).
 * A fixture's two-feature source tree is the wrong artifact for all 23, so widening the population buys 23
 * exemptions — and an exemption list is where a gate goes quiet.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { DIR_BY_PACKAGE, PACKAGE_DIRS } from './workspace-deps.ts';

/** The fixture, named once: everything below is derived from this specifier */
export const PACK_FIXTURE = '@abuddy/sdk/testing/pack-fixture';

/**
 * The package the fixture is published from, which is never policed: it *defines* the fixture, so its own
 * spec importing it says nothing about adoption.
 *
 * It was policed, and the cost was a finding that read as real and was not. `@abuddy/sdk` holds the fixture,
 * so the spec beside it satisfied "imports the fixture" trivially, which swept the SDK's other 64 test files
 * and turned up two that write a manifest through a local `fs` wrapper — invisible to the predicate, and
 * *correctly* hand-written anyway, both being the "manifest is the subject" shape (`compilePack` reads
 * `abuddy.json` alone, which is what those cases are about). Policing a package on the strength of the
 * fixture living there measures the wrong thing.
 */
export const FIXTURE_PACKAGE = PACK_FIXTURE.split('/').slice(0, 2).join('/');

/**
 * An import of the fixture: the package subpath, which is the only way to reach it from a package that does
 * not define it — a test may not import another package's tree (`repo-checks`' `spec-placement.spec.ts`).
 */
const FIXTURE_SPECIFIER = PACK_FIXTURE;

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

/** Whether a file imports the fixture — read from the tree, after a text filter that only skips work */
export function importsFixture(source: string, file = 'fixture.ts'): boolean {
  if (!source.includes('pack-fixture')) return false;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let found = false;
  parsed.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === FIXTURE_SPECIFIER) found = true;
  });
  return found;
}

/** Every `.ts` under a package's `tests/`, repo-relative */
function testFilesOf(root: string, dir: string): string[] {
  const tests = path.join(root, 'packages', dir, 'tests');
  if (!fs.existsSync(tests)) return [];
  return fs.readdirSync(tests, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
}

/** The packages whose tests this rule reads: the ones that adopted the fixture, which is not the one that has it */
export function packagesUsingFixtures(root = REPO_ROOT): string[] {
  const owner = DIR_BY_PACKAGE.get(FIXTURE_PACKAGE);
  return PACKAGE_DIRS.filter((dir) => dir !== owner).filter((dir) => testFilesOf(root, dir)
    .some((file) => importsFixture(fs.readFileSync(path.join(root, file), 'utf-8'), file))).sort();
}

/** Every test file this rule reads, repo-relative */
export function testFilesPoliced(root = REPO_ROOT): string[] {
  return packagesUsingFixtures(root).flatMap((dir) => testFilesOf(root, dir)).sort();
}
