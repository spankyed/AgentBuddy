/**
 * Which tests name a pack manifest, and how often — an inventory, not a verdict.
 *
 * `packFixture` exists so that one place decides what a pack on disk looks like, and a fixture too thin for a
 * rule to fire is a case that passes because it could not fail. The question this answers is which tests still
 * build or read one themselves.
 *
 * **It is an inventory because a classifier here kept being wrong in the expensive direction.** Three versions
 * tried to decide which manifest writes were offences: the argument text, then the write functions taken from
 * each file's own `node:fs` import, then a `JSON.stringify` of an object literal declaring an `id`. The last
 * reported **zero** offences over a population holding **seven** hand-built manifests, because each goes
 * through a one-line local wrapper (`write`, `writeAt`) and the two halves then sit in different calls. The
 * next evasion needs no cunning at all — hoist the literal into a `const` and nothing above can see it.
 * `subprocess-inventory.spec.ts` records the same lesson from the same repo: its predecessor matched argument
 * text and a hand list of spawner names, and named three spawning files where there are twelve.
 *
 * **So nothing here judges, and the detector is the dumbest complete thing**: a string literal naming the
 * manifest, anywhere in the file, counted. A wrapper, a loop, a variable and a path built at runtime all keep
 * working, because none of them can avoid writing the name down. A *gate* fails on a hit and so has to be
 * precise; an inventory fails on a **change** and so wants recall, which is cheap. A spec that merely reads a
 * manifest earns a row saying so rather than a false positive to suppress.
 *
 * What that buys, beyond not being wrong: the reasons become rows instead of a claim. The classifier said the
 * shapes it left alone — a `'{}'` discovery marker, a patch of a scaffolded pack, a manifest that *is* the
 * subject, the installed shape host owns — were excluded "by construction rather than by exemption", and that
 * was quietly false, since a fifth shape was excluded by accident. A row with a `why` is what those are.
 * It also catches the creep a verdict cannot: a second hand-written manifest in a file already listed moves
 * that file's count, where a check reporting only offences waves it through.
 *
 * **A spec using the fixture writes no manifest, so it needs no row.** The record is therefore the list of
 * tests that have not adopted `packFixture`, and it is meant to shrink.
 *
 * **Who it covers is the packages whose tests reach for the fixture**, derived by reading their imports, minus
 * the package that publishes it (`FIXTURE_PACKAGE`). A package that adopts it opts into the rule in the same
 * edit, and holding the fixture is not adopting it.
 *
 * **It is deliberately not every package that *could* import it.** `packFixture` is a source-only export of
 * `@abuddy/sdk`, so every host-layer package can resolve it, and asking all of them was measured on
 * 2026-10-02: 23 files, 20 in `@abuddy/host` and 3 in `packages/api`, and **every one of them deserves to
 * be hand-written**. They write a *data dir's* installed pack (`packs/<id>/abuddy.json`, whose subject is
 * discovery, staging or an update check) or a built built-in (`dist/runtime/index.cjs` and no source at all).
 * A fixture's two-feature source tree is the wrong artifact for all 23, so covering them would buy 23 rows
 * that say the same thing.
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

/** The manifest's name, which a test cannot avoid writing down somewhere */
const MANIFEST = 'abuddy.json';

/**
 * How many times a file names a pack manifest, from its syntax tree.
 *
 * String literals only, so a mention in a comment or in prose is not one, and `'pack/abuddy.json'` counts as
 * much as `'abuddy.json'` — a path's prefix says where, not whether. Counted rather than located: a line
 * number churns with every edit above it, and what the record is for is "how many", since a second one in a
 * file already listed is the creep.
 */
export function manifestMentions(source: string, file = 'fixture.ts'): number {
  if (!source.includes(MANIFEST)) return 0;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let found = 0;
  const walk = (node: ts.Node): void => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && (node.text === MANIFEST || node.text.endsWith(`/${MANIFEST}`))) found += 1;
    node.forEachChild(walk);
  };
  walk(parsed);
  return found;
}

/**
 * The inventory over a set of files: each one that names a manifest, with how often.
 *
 * Takes the files rather than deriving them, so a caller can run it over a population of its own — which is
 * how the rule gets a mutation case that changes the *input* instead of the expectation it compares against.
 */
export function manifestInventory(files: readonly string[], root: string): Record<string, number> {
  const rows: Record<string, number> = {};
  for (const file of files) {
    const mentions = manifestMentions(fs.readFileSync(path.join(root, file), 'utf-8'), file);
    if (mentions > 0) rows[file] = mentions;
  }
  return rows;
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
