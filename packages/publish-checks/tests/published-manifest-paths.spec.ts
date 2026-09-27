import * as fs from 'node:fs';
import * as path from 'node:path';
import { publishedTreeDirs } from '@abuddy/host/build/packages-built';
import { declaredPathFields, manifestPaths, missingPublishedPaths, type Manifest } from '@abuddy/host/build/published-manifest';
import { describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, packedFiles } from '../src/published-packages.ts';

/**
 * A published tarball names only files it contains, and runs nothing on install.
 *
 * Every other check on these packages resolves a *subset*, each on purpose: `assertExportTargetsBuilt` checks
 * the workspace directory, so it cannot see `files`; `publint` packs the file list but skips a target behind a
 * custom condition (`hasCustomCondition`); `attw` resolves standard conditions only; `test-packaged-authoring.sh`
 * imports about eight of the hundred-odd subpaths. So a manifest could name — and until `publishedManifest`
 * landed, did name, 99 times — a file no consumer ever receives, with every check green.
 *
 * It reads the staged and generated trees npm publishes, not the workspace packages they are derived from.
 */
const TREES = publishedTreeDirs();

const manifestOf = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as Manifest;

/** Packing costs ~0.3s a package, and four cases ask about the same five tarballs */
const packed = new Map<string, Set<string>>();
const filesOf = (dir: string): Set<string> => {
  const known = packed.get(dir) ?? packedFiles(dir);
  packed.set(dir, known);
  return known;
};

/** `<package>: <what names it> -> <detail>`, the shape every case below reports in */
const report = (pkg: string, detail: string) => `${pkg}: ${detail}`;

describe.skipIf(!PACKAGES_BUILT)('a published tarball', () => {
  it('names only files it ships', () => {
    const missing = Object.entries(TREES).flatMap(([pkg, dir]) =>
      missingPublishedPaths(manifestOf(dir), filesOf(dir)).map((problem) => report(pkg, problem)));
    expect(missing).toEqual([]);
  });

  /**
   * An absence, not a list of hook names: npm adds those, and the next one would arrive unchecked. It is also
   * what keeps the published manifest a build output — a `prepack` hook rewriting `package.json` in place would
   * race the specs that pack these packages concurrently.
   */
  it('runs no scripts on install', () => {
    const withScripts = Object.entries(TREES)
      .map(([pkg, dir]) => [pkg, manifestOf(dir).scripts] as const)
      .filter(([, scripts]) => scripts !== undefined)
      .map(([pkg, scripts]) => report(pkg, `scripts -> ${Object.keys(scripts as object).join(', ')}`));
    expect(withScripts).toEqual([]);
  });

  /**
   * The inverse of the failure a staged tree can introduce, and the reason the source condition has nothing to
   * resolve to here. Not "no `.ts` file", which is red on a correct artifact twice over: `@abuddy/cli` ships its
   * pack templates as source on purpose, and `@abuddy/ui`'s declarations are named `*.d.vue.ts`, which no
   * `.d.ts` test matches.
   */
  it('ships no source directory', () => {
    const source = Object.entries(TREES).flatMap(([pkg, dir]) => [...filesOf(dir)]
      .filter((file) => file === 'src' || file.startsWith('src/'))
      .map((file) => report(pkg, `a packed file -> ${file}`)));
    expect(source).toEqual([]);
  });

  /**
   * What stops the cases above passing by finding nothing. `@abuddy/cli`'s `bin` is `"bin/abuddy.mjs"` with no
   * `./` prefix, so an extractor keyed on that prefix reports green over zero paths — and `bin` is the only path
   * that manifest names at all.
   */
  it('is checked over at least one path per package, and per field it declares', () => {
    const vacuous = Object.entries(TREES).flatMap(([pkg, dir]) => {
      const manifest = manifestOf(dir);
      const found = manifestPaths(manifest);
      if (found.length === 0) return [report(pkg, 'its whole manifest names no path this case could check')];
      return declaredPathFields(manifest)
        .filter((field) => !found.some(([what]) => what === field || /^[.[]/.test(what.slice(field.length))))
        .map((field) => report(pkg, `${field} is declared but contributed no path`));
    });
    expect(vacuous).toEqual([]);
  });
});
