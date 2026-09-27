// A feature's frontend is its own, which is the one pack rule whose subject is the shape of a pack rather than
// what a file imports from outside it. Its own module beside `pack-rules.ts`, as `source-resolution`'s is, so the
// rule table stays a table.
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { packTargetOf } from '@abuddy/host/build/own-module-specifiers';
import type { SourceView } from './pack-sources.ts';
import type { PackFinding, PackPlace } from './pack-rules.ts';

/**
 * The source files a package publishes, from its `package.json` `exports`.
 *
 * A package's entry is where it assembles what it offers, so naming its own features' frontends there is that
 * module's job rather than a crossing: `@abuddy/host`'s `./fe` barrel is exactly that, and a pack's generated
 * `pack-entry-fe.ts` is the same module written by codegen (excluded below with the rest of `__generated__`).
 *
 * **Being published is not enough; the caller must also be outside every feature.** A package may publish a
 * feature's own module — `@abuddy/host` publishes `./settings` from `features/settings/be/index.ts` — and that is
 * a feature's barrel, not the package's assembly. What says a module is assembling the pack is where it sits,
 * not whether anyone can see it; excepting it by visibility alone hands that one feature a licence no other has.
 *
 * Derived, and it fails closed: a tree with no `package.json`, no `exports`, or an entry behind conditions excepts
 * nothing and gets the strict rule. That is the opposite of deriving an exception from a *missing* file, which
 * would widen the gate exactly when something had gone missing.
 */
function readPublishedEntryPoints(packageDir: string): Set<string> {
  const manifest = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifest)) return new Set();
  const { exports: entries } = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { exports?: Record<string, unknown> };
  return new Set(Object.values(entries ?? {})
    .filter((target): target is string => typeof target === 'string')
    .map((target) => path.resolve(packageDir, target)));
}

/**
 * Read once per pack rather than once per file: a pack's every file asks the same question, and a pack of 500
 * files would otherwise parse the same `package.json` 500 times.
 *
 * Keyed by the manifest's modification time as well as its path, so there is no cache to remember to clear: a
 * test tree that rewrites a pack's `exports` under a path it has used before gets the new answer, where a
 * path-keyed cache would hand back the old one and no reset call is easy to notice missing.
 */
const published = new Map<string, Set<string>>();
function publishedEntryPoints(packageDir: string): Set<string> {
  const manifest = path.join(packageDir, 'package.json');
  const stamp = fs.existsSync(manifest) ? `${packageDir}@${fs.statSync(manifest).mtimeMs}` : packageDir;
  const known = published.get(stamp) ?? readPublishedEntryPoints(packageDir);
  published.set(stamp, known);
  return known;
}

/** The local names a module binds from an import, or exports without re-exporting (`export { a }`, `export default a`) */
function localNames(node: ts.Node): string[] {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return [];
    const bindings = clause.namedBindings;
    const named = !bindings ? [] : ts.isNamespaceImport(bindings) ? [bindings.name.text] : bindings.elements.map((el) => el.name.text);
    return clause.name ? [clause.name.text, ...named] : named;
  }
  // `export default a`, and `export { a, b as c }` — the local is the name before `as`
  if (ts.isExportAssignment(node)) return ts.isIdentifier(node.expression) ? [node.expression.text] : [];
  if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
    return node.exportClause.elements.map((el) => (el.propertyName ?? el.name).text);
  }
  return [];
}

/**
 * The spans of the declarations in `view` that pass another module's exports on: `export … from '…'`, and an
 * import whose bindings this module exports again.
 *
 * Spans rather than specifier text, because one file may both import a module plainly and re-export from it, and
 * only the second is a door. The regex this replaced correlated two passes by byte offset to tell them apart;
 * with a syntax tree the declaration is the unit, so the containment test below is all it takes.
 *
 * Deliberately no wider than what it replaced: `export { a }` and `export default a`, not `export const a =
 * imported` or a binding passed on inside an object literal. Widening it would report imports the old rule
 * allowed, and there are none to report today.
 */
function doorSpans(view: SourceView): { start: number; end: number }[] {
  const exported = new Set(view.visit((node) => (ts.isImportDeclaration(node) ? undefined : localNames(node))).map(({ what }) => what));
  return view.visit((node) => {
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) return [''];
    if (!ts.isImportDeclaration(node)) return undefined;
    return localNames(node).some((name) => exported.has(name)) ? [''] : undefined;
  });
}

/**
 * Each import of another feature's frontend this file makes. A feature reaches into no other feature's frontend at
 * all: what one offers the rest is its plugin's contract — its published state, which `#generated/fe` generates
 * typed readers for, and the inbox `#generated/events` types the sends with. Neither needs a module of the other
 * feature's, so there is nothing left for an exception to bless.
 *
 * A feature's modules outside its `fe/` may use its frontend but not pass it on (`export … from './fe/state'`),
 * which would be a second door.
 *
 * Two modules are exempt, and both are the pack's own assembly rather than one feature reaching another: generated
 * code, which registers every feature's plugin, and what the package publishes (`publishedEntryPoints`).
 *
 * Which specifiers it can follow at all is `packTargetOf` (`@abuddy/host/build/own-module-specifiers`), not
 * restated here: a pack-internal one, relative or a `#` subpath of the pack's own.
 *
 * It reads a syntax tree, as every rule here does bar none. It used to match regexes over the repo's packs, where
 * 28% of what it read were `.vue` files read whole: a commented-out import, one in a `<template>`, one in a
 * template literal and a CSS `@import` in a `<style>` block all counted, while a module path in a `vi.mock` did
 * not.
 *
 * The layout comes from `at.inRoot`, so it is the same whether the caller pointed at `src` or at `tests`, and the
 * root itself is walked back from the file rather than assumed: `place.relative` means different things to the two
 * runners (pack-relative for a pack's own build, repo-relative for `check:specifiers`, which prints it).
 */
export function crossFeatureFindings(view: SourceView, at: PackPlace): PackFinding[] {
  if (at.generated) return [];
  const root = path.resolve(view.file, ...at.inRoot.split('/').map(() => '..'));
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  const featureOf = (file: string) => /^features\/([^/]+)\//.exec(relative(file))?.[1];
  const ownFeature = featureOf(view.file);
  // What the package publishes, from outside every feature: the module that assembles it
  if (ownFeature === undefined && publishedEntryPoints(at.packDir).has(view.file)) return [];
  const inOwnFrontend = /^features\/[^/]+\/fe\//.test(at.inRoot);
  const doors = inOwnFrontend ? [] : doorSpans(view);
  return view.specifiers.flatMap(({ text, line, start, end }) => {
    const target = packTargetOf(at.packDir, at.imports, view.file, text);
    if (target === undefined) return [];
    const into = /^features\/([^/]+)\/fe(?:\/.+)?$/.exec(relative(target));
    if (!into) return [];
    const passedOn = doors.some((door) => start >= door.start && end <= door.end);
    if (into[1] === ownFeature && (inOwnFrontend || !passedOn)) return [];
    return [{ line, what: text, start, end }];
  });
}
