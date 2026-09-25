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
 * A spec whose correctness depends on a module under the repo's `scripts/`.
 *
 * The import half resolves each relative specifier rather than matching `/scripts/` as text, because
 * `@abuddy/ui` has a `scripts/` of its own and a spec about *its* export map is not a repo check. The
 * second half is for a spec that never imports one because it runs it as a process, which is how
 * `with-source` and `import-specifiers-script` reach their subject.
 */
const namesRepoScripts = (file: string): boolean => {
  const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
  const dir = path.dirname(path.join(REPO_ROOT, file));
  for (const [, specifier] of text.matchAll(/(?:from|import\()\s*'(\.[^']*)'/g)) {
    if (path.resolve(dir, specifier).startsWith(REPO_SCRIPTS)) return true;
  }
  return /REPO_ROOT,\s*'scripts'/.test(text);
};

/**
 * A spec that names a repo script without its subject being one, and why. Kept to the ones that name a
 * script as an *expected value* rather than reading or running it — the one case the rule above cannot
 * tell apart, since both spell the path the same way.
 */
const NOT_A_REPO_CHECK: Record<string, string> = {
  'packages/abuddy-cli/tests/build/package-freshness.spec.ts':
    'its subject is the freshness rule in @abuddy/host/build/packages-built; it asserts that BUILD_UNITS '
    + 'names the build scripts among its inputs, and never reads them',
};

const IS_SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;
const OWN_PACKAGE = 'packages/repo-checks/';
const THIS_SPEC = `${OWN_PACKAGE}tests/repo-check-boundary.spec.ts`;

const specs = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n').filter((file) => file !== '' && IS_SPEC.test(file));

describe('a spec about the repo\'s tooling lives in @app/repo-checks', () => {
  it('has none anywhere else', () => {
    const elsewhere = specs()
      .filter((file) => !file.startsWith(OWN_PACKAGE))
      .filter(namesRepoScripts)
      .filter((file) => !(file in NOT_A_REPO_CHECK));
    expect(elsewhere, 'move these to packages/repo-checks/tests: a spec that reads the repo\'s scripts is a '
      + 'repo check, and outside this package npm run spec cannot reach it from a change to what it checks')
      .toEqual([]);
  });

  // A list of exceptions is only honest while each one is still an exception
  it('lists no exception that has stopped applying', () => {
    const stale = Object.keys(NOT_A_REPO_CHECK)
      .filter((file) => !fs.existsSync(path.join(REPO_ROOT, file)) || !namesRepoScripts(file));
    expect(stale, 'these are gone or no longer name a repo script; drop them from NOT_A_REPO_CHECK').toEqual([]);
  });

  // The converse, so the package stays what it says it is. A spec that lands here and checks something else
  // makes "the repo checks" a name for wherever a spec was inconvenient, which is what it replaced.
  it('holds nothing else', () => {
    const here = specs().filter((file) => file.startsWith(OWN_PACKAGE) && file !== THIS_SPEC);
    expect(here.filter((file) => !namesRepoScripts(file)),
      'this package is for specs whose subject is a repo script; these name none').toEqual([]);
  });
});
