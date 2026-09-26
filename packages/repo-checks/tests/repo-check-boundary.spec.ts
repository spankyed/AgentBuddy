import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * What this package is for, as a check rather than as a convention.
 *
 * The repo's own tooling is checked by specs like everything else, and those specs used to live in
 * `@abuddy/cli` — not because they were about the CLI, but because it was the package with a vitest config
 * nearest the scripts. Fifteen of them accumulated there, and they were invisible to `npm run spec`: a
 * change to `scripts/` belongs to no package, so the command that runs "the specs your changes affect" ran
 * none of them.
 *
 * Both halves of that are fixed, and both need holding. `scripts/spec.ts` routes repo tooling here; this is
 * the other half.
 */

/** Where the repo's own scripts live — not a package's `scripts/`, which is that package's business */
const REPO_SCRIPTS = path.join(REPO_ROOT, 'scripts') + path.sep;

/**
 * **Importing** a module under the repo's `scripts/`.
 *
 * Resolves each relative specifier rather than matching `/scripts/` as text, because `@abuddy/ui` has a
 * `scripts/` of its own and a spec about *its* export map is not a repo check.
 *
 * This is what the first check below asks, and it asks only this, because what that check protects is
 * *reachability*: `scripts/spec.ts` routes a change under `scripts/` to this package, so a spec that imports
 * one and lives elsewhere is a spec that will not run when what it covers changes. An import is the only
 * thing that can create that, and it is now the only thing that can, since `check:specifiers` refuses a
 * package reaching into `scripts/` at all.
 */
const importsARepoScript = (file: string): boolean => {
  const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
  const dir = path.dirname(path.join(REPO_ROOT, file));
  for (const [, specifier] of text.matchAll(/(?:from|import\()\s*'(\.[^']*)'/g)) {
    if (path.resolve(dir, specifier).startsWith(REPO_SCRIPTS)) return true;
  }
  return false;
};

/**
 * Importing one, **or running one as a process**.
 *
 * This is what the second check asks, and the wider question is right there: it is about *cohesion*, that
 * this package holds nothing unrelated, and a spec that spawns `scripts/with-source.mjs` is as much about
 * repo tooling as one that imports it. `with-source` and `import-specifiers-script` reach their subject
 * that way and import nothing.
 *
 * The two checks asked one question between them until 2026-09-26, and that cost an allowlist: a spec
 * naming a script path as an *expected value* — `package-freshness` asserting `BUILD_UNITS` covers the
 * build scripts — tripped the reachability check, which it cannot affect, and had to be excused. Asking
 * each check only what it needs left no exception to write down.
 */
const namesARepoScript = (file: string): boolean =>
  importsARepoScript(file) || /REPO_ROOT,\s*'scripts'/.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'));

const IS_SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;
const OWN_PACKAGE = 'packages/repo-checks/';
/**
 * The specs here whose subject is the repo's own *layout* rather than a module under `scripts/`, and why.
 *
 * They are the reason the converse check below is not simply "names a repo script". A check on where specs
 * live, or on which packages have suites, has no `scripts/` module behind it to import — it reads the tree.
 * That still belongs here: it is a property of the repo, owned by no package, which is what this package is
 * for. Kept as a named list rather than a widened predicate, because "its subject is repo-wide" is not
 * something a check can decide about itself.
 */
const LAYOUT_CHECKS: Record<string, string> = {
  'tests/spec-placement.spec.ts': 'where a spec lives and which packages have suites — a property of the '
    + 'tree, read from git and the manifests, with no scripts/ module to import',
  'tests/doc-links.spec.ts': 'that a relative link between the repo\'s documents resolves — a property of '
    + 'the doc tree, read from git, with no scripts/ module behind it either',
};

const specs = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n').filter((file) => file !== '' && IS_SPEC.test(file));

describe('a spec about the repo\'s tooling lives in @app/repo-checks', () => {
  it('has none anywhere else', () => {
    const elsewhere = specs().filter((file) => !file.startsWith(OWN_PACKAGE)).filter(importsARepoScript);
    expect(elsewhere, 'move these to packages/repo-checks/tests: npm run spec routes a change under scripts/ '
      + 'to this package alone, so a spec importing one from anywhere else will not run when what it covers '
      + 'changes').toEqual([]);
  });

  // The converse, so the package stays what it says it is. A spec that lands here and checks something else
  // makes "the repo checks" a name for wherever a spec was inconvenient, which is what it replaced.
  it('holds nothing else', () => {
    const here = specs().filter((file) => file.startsWith(OWN_PACKAGE)
      && !(file.slice(OWN_PACKAGE.length) in LAYOUT_CHECKS));
    expect(here.filter((file) => !namesARepoScript(file)),
      'this package is for specs whose subject is a repo script or the repo\'s own layout; these are '
      + 'neither — move them, or add them to LAYOUT_CHECKS with what repo-wide property they check').toEqual([]);
  });

  // The list is only honest while each entry is still here and still needs the exemption
  it('lists no layout check that has stopped applying', () => {
    const stale = Object.keys(LAYOUT_CHECKS).filter((rel) => {
      const file = `${OWN_PACKAGE}${rel}`;
      return !fs.existsSync(path.join(REPO_ROOT, file)) || namesARepoScript(file);
    });
    expect(stale, 'these are gone, or now name a repo script and need no exemption; drop them from '
      + 'LAYOUT_CHECKS').toEqual([]);
  });
});
