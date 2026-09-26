import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * A spec lives with the thing it can break.
 *
 * The rule this repo already applies to repositories and migrations, checked for specs. Two ways it fails,
 * and they have different causes:
 *
 * - **A package has source and no suite.** Then there is nowhere for its specs to be, so they end up in a
 *   neighbour — and `npm run spec`, which asks which package a changed file belongs to, finds nothing to
 *   run. `@abuddy/testing` and `@abuddy/ui` were in this state: six specs about them lived in `@abuddy/cli`,
 *   and asking for the specs covering `@abuddy/testing/src/launch-env.ts` did not report "none", it crashed
 *   in vitest's project resolution, because with no config of its own vitest walked up to the root one and
 *   resolved its `projects` list against the wrong directory.
 * - **A spec reaches into another package's tree.** The assertion is right and the location is not, so a
 *   failure points at the wrong package and a rename in one breaks a suite in another.
 *
 * Neither is a mistake anyone makes on purpose; both are what a package extraction leaves behind when the
 * tests do not follow it. Every one this repo has done — `@abuddy/host` out of the api, `@abuddy/testing`,
 * `@abuddy/ui`, `@app/repo-checks` — left some, and nothing noticed any of them. That is what these two
 * checks are for: not to find today's, which `goal-test-placement.md` moved, but to fail on the next one.
 *
 * The repo's own `scripts/` is the other half of this and lives in `repo-check-boundary.spec.ts`; between
 * them every tree a spec can reach across is covered.
 */

const IS_SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;

const tracked = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\n').filter(Boolean);

const packageDirs = (): string[] =>
  fs.readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, 'packages', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();

/**
 * A package with source and deliberately no suite, and why. An entry here is a claim that nothing in its
 * `src/` is worth a spec — which is a strong claim, so it carries a reason and is reported when it stops
 * applying.
 */
const NO_SUITE: Record<string, string> = {
  preload: 'the IPC bridge: a handful of contextBridge declarations with no logic, and its own CLAUDE.md '
    + 'explains why it is built rather than tested (a bare tsc there writes .js into src/). The E2E suite '
    + 'exercises it through every window it opens',
};

describe('a package with source has a suite', () => {
  const withSource = (): string[] => packageDirs().filter((dir) => fs.existsSync(path.join(REPO_ROOT, 'packages', dir, 'src')));
  const hasSuite = (dir: string): boolean => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as
      { scripts?: Record<string, string> };
    return manifest.scripts?.test !== undefined;
  };

  it('leaves none of them without one', () => {
    const missing = withSource().filter((dir) => !hasSuite(dir) && !(dir in NO_SUITE));
    expect(missing, 'give these a vitest config and a `test` script, or add them to NO_SUITE with a reason: '
      + 'a package with no suite has nowhere to put its specs, so they end up in a neighbour where '
      + 'npm run spec cannot find them from a change to what they cover').toEqual([]);
  });

  // A list of exceptions is only honest while each one is still an exception
  it('lists no exception that has stopped applying', () => {
    const stale = Object.keys(NO_SUITE).filter((dir) => !withSource().includes(dir) || hasSuite(dir));
    expect(stale, 'these are gone, have no src/, or now have a suite; drop them from NO_SUITE').toEqual([]);
  });
});

/**
 * A spec that reads another package's tree without going through its published entry, and why. Kept for a
 * spec whose subject genuinely spans packages — not for one that is simply in the wrong place, which is a
 * move rather than an entry here.
 */
const SPANS_PACKAGES: Record<string, string> = {
  'packages/abuddy-cli/tests/build/fe-bundler-ui-theme.spec.ts':
    "its four tests are a chain across three packages: @abuddy/ui's preset defines the shades its components "
    + 'name, the renderer applies that preset instead of copying the colours, and a built fe.bundleUi pack '
    + 'ships CSS for them. Moving it to @abuddy/ui would put a dependency on the app\'s tree and a fixture '
    + "pack's build output into a leaf package's suite; splitting it would lose the chain",
};

/**
 * A spec that packs the published packages into a consumer, and why it is not in `@app/publish-checks`.
 *
 * Every entry is a claim that the packed consumer is the spec's *fixture* rather than its *subject* — that
 * what fails when the spec fails is the package it lives in, not the publish. That is a real distinction and
 * the reason `@abuddy/cli` keeps three of these, but it is not one a checker can make, so it is written
 * down per spec.
 */
const PACKS_AS_A_FIXTURE: Record<string, string> = {
  'packages/abuddy-cli/tests/build/facade-typing.integration.spec.ts':
    "the facade gate: it compiles a dependent pack against the packed packages, so a failure is abuddy build's",
  'packages/abuddy-cli/tests/build/fe-bundler-host-registry.integration.spec.ts':
    "the FE bundler's host-registry proxying, with a packed consumer as the thing it bundles against",
  'packages/abuddy-cli/tests/build/types-bundler-determinism.integration.spec.ts':
    'the types bundler emits the same facade from the workspace and from the packed tarballs — the packed '
    + 'side is one of two inputs to a comparison about the bundler',
  'packages/abuddy-cli/tests/build/package-freshness.spec.ts':
    "the stamp rule in @abuddy/host/build/packages-built; it reads PACKED_PACKAGES only to assert BUILD_UNITS "
    + 'covers everything packed, and never packs anything itself',
};

describe('a spec about the published packages lives in @app/publish-checks', () => {
  const FIXTURE = '@app/publish-checks';
  const HOME = 'packages/publish-checks/';

  /** Importing the packing fixture is the signal: nothing else in the repo installs a published consumer. */
  const packs = (spec: string): boolean =>
    fs.readFileSync(path.join(REPO_ROOT, spec), 'utf-8').includes(`from '${FIXTURE}'`);

  const specs = (): string[] => tracked().filter((file) => IS_SPEC.test(file) && file.startsWith('packages/'));

  it('there are some, so this check is not vacuous', () => {
    expect(specs().filter((file) => file.startsWith(HOME) || packs(file))).not.toEqual([]);
  });

  it('leaves none of them elsewhere', () => {
    const elsewhere = specs()
      .filter((file) => !file.startsWith(HOME) && packs(file))
      .filter((file) => !(file in PACKS_AS_A_FIXTURE));
    expect(elsewhere, `move these to ${HOME}, or record in PACKS_AS_A_FIXTURE why the packed consumer is `
      + "this spec's fixture rather than its subject").toEqual([]);
  });

  it('lists no exception that has stopped applying', () => {
    const stale = Object.keys(PACKS_AS_A_FIXTURE)
      .filter((file) => !fs.existsSync(path.join(REPO_ROOT, file)) || !packs(file));
    expect(stale, 'these are gone or no longer pack a consumer; drop them from PACKS_AS_A_FIXTURE').toEqual([]);
  });
});

describe('a spec does not reach into another package', () => {
  const RELATIVE = /(?:from|import\(|require\()\s*['"](\.[^'"]*)['"]/g;

  /**
   * Whether a specifier names something on disk, trying the extensions a TypeScript import may leave off.
   *
   * It is what keeps this from reading a spec's own fixtures as imports. `import-specifiers.integration`
   * writes files full of import statements into temp directories to feed the specifier checker, and a
   * pattern over the spec's text cannot tell those from the spec's own — but they name paths that do not
   * exist (`../../code/fe/state`), so resolving separates them without an exception list.
   */
  const resolves = (target: string): boolean =>
    ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue', '/index.ts', '/index.js']
      .some((suffix) => fs.existsSync(path.join(REPO_ROOT, target + suffix)));

  /** Every relative import in a spec that resolves inside a different package under `packages/` */
  const reaches = (spec: string): string[] => {
    const own = /^packages\/([^/]+)\//.exec(spec)?.[1];
    if (own === undefined) return [];
    const dir = path.dirname(spec);
    const out = new Set<string>();
    for (const [, specifier] of fs.readFileSync(path.join(REPO_ROOT, spec), 'utf-8').matchAll(RELATIVE)) {
      const target = path.normalize(path.join(dir, specifier));
      const into = /^packages\/([^/]+)\//.exec(target)?.[1];
      if (into !== undefined && into !== own && resolves(target)) out.add(target);
    }
    return [...out].sort();
  };

  const specs = (): string[] => tracked().filter((file) => IS_SPEC.test(file) && file.startsWith('packages/'));

  it('leaves none of them doing it', () => {
    const offenders = specs()
      .filter((spec) => !(spec in SPANS_PACKAGES))
      .flatMap((spec) => reaches(spec).map((target) => `${spec} -> ${target}`));
    expect(offenders, 'move the spec to the package whose source it reads, or import that package by name if '
      + 'it publishes what the spec needs; a relative path into another package makes a rename there break a '
      + 'suite here, and a failure point at the wrong package').toEqual([]);
  });

  it('lists no exception that has stopped applying', () => {
    const stale = Object.keys(SPANS_PACKAGES)
      .filter((spec) => !fs.existsSync(path.join(REPO_ROOT, spec)) || reaches(spec).length === 0);
    expect(stale, 'these are gone or no longer reach another package; drop them from SPANS_PACKAGES').toEqual([]);
  });
});
