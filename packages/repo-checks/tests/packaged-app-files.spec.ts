import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { packagesBuiltOrRefuse, REPO_ROOT } from '@abuddy/host/build/packages-built';
import { FileMatcher } from 'app-builder-lib/out/fileMatcher.js';
import { beforeAll, describe, expect, it } from 'vitest';

// What the app installs, asked of the matcher electron-builder itself builds from `electron-builder.mjs`.
//
// Nothing else looks at that file: it is named by no chain step on purpose (`chain-inputs.spec.ts`'s
// `NOT_A_CHAIN_INPUT` — it is read by `npm run build-prod`, which is not one), and its patterns have gone wrong
// silently before. The exclusion of `.ts` files once stripped the CLI's scaffold templates out of the installed
// app, found by packaging the app and listing what arrived.
//
// Two things this spec does that a check on a config usually does not, both because both failed here first:
//
//   - **It names no file.** Every subject is a real tree walked at run time. The first version of this spec asked
//     about four string literals, one of which was `templates/pack/src/env.d.ts` — a path no template has been
//     since `.d.ts` templates were ruled out. The matcher answers about any string, so nothing said the probe was
//     fiction. A population that comes from the tree cannot be.
//   - **It mutates the pattern list and asserts the answer flips.** The list is data this spec already holds, so
//     a pattern can be filtered out of a copy in memory and the matcher rebuilt for microseconds. Without that,
//     "no staged file ships" passes just as well when nothing excludes them and nothing is there to ship — which
//     is how the check this replaced went green while the include it pinned was deleted.
//
// `FileMatcher` is app-builder-lib's, reached by its internal path, which an electron-builder upgrade may move.
// That fails here, loudly, naming itself — against a text comparison that cannot fail for the right reason at
// all, it is the better trade. This package declares `app-builder-lib` at electron-builder's own version rather
// than reaching it through hoisting, so the coupling is in a manifest where an upgrade has to look at it.
//
// Line comments, not a doc block: half the subject matter is glob patterns, and a `*` before a `/` ends one.

/** Skips the two cases that read build output, and refuses rather than reading a stale one */
const PACKAGES_BUILT = packagesBuiltOrRefuse('npm run packages:build');

/** The `files` array electron-builder is given, which is also the data the mutation cases edit a copy of */
let patterns: string[];

beforeAll(async () => {
  // By URL rather than a relative specifier, as `abuddy-cli/tests/app/beta-app.spec.ts` reads the same config
  const config = (await import(pathToFileURL(path.join(REPO_ROOT, 'electron-builder.mjs')).href)).default as { files: string[] };
  patterns = config.files;
});

/**
 * The filter electron-builder would use for a pattern list, built once per list.
 *
 * `createFilter()` compiles every pattern into a `Minimatch`, so building one per path made this file 485ms
 * where it is 69 — the populations are a couple of thousand files and each case asks about all of them. Keyed
 * by the array, which is why each case hoists its own list rather than calling `without()` in a loop.
 */
const filters = new Map<readonly string[], (file: string, stat: never) => boolean>();
function filterFor(used: string[]): (file: string, stat: never) => boolean {
  // `from` is the directory the patterns are relative to; the macro expander is identity, because none of these
  // patterns carries a macro. The filter reads nothing off a stat but whether it is a directory.
  const known = filters.get(used) ?? new FileMatcher(REPO_ROOT, 'app', (pattern) => pattern, used).createFilter();
  filters.set(used, known);
  return known;
}

/** Whether the app would carry `relative`, under the given patterns */
const shipsUnder = (used: string[], relative: string): boolean =>
  filterFor(used)(path.join(REPO_ROOT, relative), { isDirectory: () => false } as never);

const ships = (relative: string) => shipsUnder(patterns, relative);
const without = (...dropped: string[]) => patterns.filter((pattern) => !dropped.includes(pattern));

/**
 * Every file under `dir`, relative to the repo root — the population a case asks about, never a literal.
 *
 * Dirents rather than names, so one recursive read answers both what is there and what is a file, without a
 * `statSync` per entry across a few thousand of them.
 */
function filesUnder(dir: string): string[] {
  const root = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(REPO_ROOT, path.join(entry.parentPath, entry.name)));
}

/** Every `packages/<pkg>/<part>` that exists: the populations below are per-package, and derived */
const perPackage = (part: string): string[] =>
  fs.readdirSync(path.join(REPO_ROOT, 'packages')).flatMap((pkg) => filesUnder(path.join('packages', pkg, part)));

/** What every case does before asserting: a population it cannot read is a case that proves nothing */
function population(what: string, files: string[]): string[] {
  expect(files.length, `${what} is empty, so anything asserted over it would pass for the wrong reason`).toBeGreaterThan(0);
  return files;
}

const TEMPLATES = 'packages/abuddy-cli/templates';
const PACKED_TEMPLATES = 'packages/abuddy-cli/dist/package/templates';

describe("the packaged app's file list", () => {
  /**
   * The scaffold's templates, from the source tree — tracked, so this case needs no build — at the path
   * `bundle-package` copies them to. That mapping is the one thing derived rather than read, so the case below
   * checks it against the built tree when there is one.
   */
  const packedTemplates = () =>
    population('the scaffold templates', filesUnder(TEMPLATES))
      .map((file) => path.join(PACKED_TEMPLATES, path.relative(TEMPLATES, file)));

  it("keeps every one of the CLI's scaffold templates", () => {
    expect(packedTemplates().filter((file) => !ships(file))).toEqual([]);
  });

  /**
   * The mutation, and what it taught: **both** patterns carry the templates — `packages/*` + `/dist/**` and the
   * dedicated include — so the app breaks when no pattern reaches them, not when either is edited. That is why
   * the older check on one include's string position is gone: it failed on a harmless edit and not on this.
   *
   * And it is the `.ts` templates that depend on them, all 27 of 27. The other seven are `.yml` and `.vue`,
   * which no exclusion names, so the recursive include of `packages` carries them either way. Asserting all 34
   * would have been wrong, and this case said so on its first run.
   */
  it('would lose its TypeScript templates if both patterns that carry them went', () => {
    const stripped = without('packages/*/dist/**', 'packages/abuddy-cli/dist/package/templates/**');
    const typescript = packedTemplates().filter((file) => file.endsWith('.ts'));
    expect(population('the TypeScript templates', typescript).filter((file) => shipsUnder(stripped, file))).toEqual([]);
  });

  it('ships no package source', () => {
    expect(population('every package source file', perPackage('src')).filter(ships)).toEqual([]);
  });

  /**
   * The trees `stagePublishTree` writes so `npm publish` has something to publish. The app never loads one — it
   * resolves `@abuddy/sdk` through `node_modules` to `packages/abuddy-sdk/dist` — and the recursive include of
   * `packages` took all three until the publish exclusion was added, because electron-builder reads no
   * `.gitignore`. Measured before it was: 597 files, 1.66MB of them surviving the other exclusions.
   */
  describe.skipIf(!PACKAGES_BUILT)('over the built trees', () => {
    it('ships no tree staged for npm', () => {
      expect(population('the staged trees', perPackage('publish')).filter(ships)).toEqual([]);
    });

    /**
     * The mutation. Not *all* of them come back — 256 of 597 did when this was measured, the `.js`, `.css` and
     * `.json`; the rest are `.d.ts`, `.map` and `.md`, which other exclusions already name. So the claim is that
     * this pattern is the only thing standing between the app and a second copy of the packages, not that it is
     * the only thing that ever touches those files. A count would date on the next module.
     */
    it('would carry them without the one pattern that excludes them', () => {
      const stripped = without('!packages/*/publish/**');
      const staged = population('the staged trees', perPackage('publish'));
      expect(staged.filter((file) => shipsUnder(stripped, file)).length,
        'nothing came back, so this pattern is not what keeps the staged trees out').toBeGreaterThan(0);
    });

    it("ships every file of a package's compiled output", () => {
      expect(population("@abuddy/sdk's dist", filesUnder('packages/abuddy-sdk/dist')).filter((file) => !ships(file))).toEqual([]);
    });

    /** The mapping the templates cases derive: what `bundle-package` copied is what they assumed it would */
    it('carries the templates at the path the build copies them to', () => {
      const packed = population('the packed templates', filesUnder(PACKED_TEMPLATES))
        .map((file) => path.relative(PACKED_TEMPLATES, file));
      const source = filesUnder(TEMPLATES).map((file) => path.relative(TEMPLATES, file));
      expect(packed.sort()).toEqual(source.sort());
    });
  });
});
