import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishedTreeDirs } from '@abuddy/host/build/packages-built';
import { PACKAGES_BUILT, packedFiles } from '../src/published-packages.ts';

/**
 * A published tarball names only files it contains, and runs nothing on install.
 *
 * Every other check on these packages resolves a *subset*: `assertExportTargetsBuilt` checks the workspace
 * directory, so it cannot see `files`; `publint` packs the file list but skips any target behind a custom
 * condition on purpose; `attw` resolves standard conditions only; `test-packaged-authoring.sh` imports about
 * eight of the hundred-odd subpaths. So a manifest could name — and for a long time did name — a file no
 * consumer ever receives, and nothing said so.
 */
const TREES = publishedTreeDirs();

/** The manifest fields whose values are paths into the package. `files` is globs, and is npm's business */
const PATH_FIELDS = ['exports', 'main', 'module', 'types', 'typings', 'browser', 'bin', 'typesVersions'] as const;

/** Every path a manifest names, as [what names it, the path]: every condition, every depth, `null` skipped */
function manifestPaths(manifest: Record<string, unknown>): [string, string][] {
  const found: [string, string][] = [];
  const walk = (node: unknown, what: string): void => {
    if (typeof node === 'string') found.push([what, node]);
    else if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${what}[${index}]`));
    // The keys are subpaths, conditions or version ranges; only the values name files
    else if (node !== null && typeof node === 'object') for (const [key, value] of Object.entries(node)) walk(value, `${what}.${key}`);
  };
  for (const field of PATH_FIELDS) if (field in manifest) walk(manifest[field], field);
  return found;
}

const manifestOf = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as Record<string, unknown>;

/** Packing costs ~0.3s a package, and four cases ask about the same five tarballs */
const packed = new Map<string, Set<string>>();
const filesOf = (dir: string): Set<string> => {
  if (!packed.has(dir)) packed.set(dir, packedFiles(dir));
  return packed.get(dir)!;
};

/** Whether the tarball holds what a target names. A `*` target is a pattern, so some file must match it */
function ships(files: Set<string>, target: string): boolean {
  const wanted = target.replace(/^\.\//, '');
  if (!wanted.includes('*')) return files.has(wanted);
  const [before, after] = wanted.split('*', 2) as [string, string];
  return [...files].some((file) => file.startsWith(before) && file.endsWith(after) && file.length >= before.length + after.length);
}

/** `<package>: <what names it> -> <target>`, the shape every case below reports in */
const report = (pkg: string, what: string, detail: string) => `${pkg}: ${what} -> ${detail}`;

describe.skipIf(!PACKAGES_BUILT)('a published tarball', () => {
  it('names only files it ships', () => {
    const missing = Object.entries(TREES).flatMap(([pkg, dir]) => {
      const files = filesOf(dir);
      return manifestPaths(manifestOf(dir))
        .filter(([, target]) => !ships(files, target))
        .map(([what, target]) => report(pkg, what, target));
    });
    expect(missing).toEqual([]);
  });

  /**
   * An absence, not a list of hook names: npm adds those, and the next one would arrive unchecked. It is also
   * what keeps the published manifest a build output — a `prepack` that rewrote `package.json` in place would
   * race the specs that pack these packages concurrently.
   */
  it('runs no scripts on install', () => {
    const withScripts = Object.entries(TREES)
      .filter(([, dir]) => 'scripts' in manifestOf(dir))
      .map(([pkg, dir]) => report(pkg, 'scripts', Object.keys(manifestOf(dir).scripts as object).join(', ')));
    expect(withScripts).toEqual([]);
  });

  /**
   * The inverse of the failure a staged publish tree can introduce. Not "no `.ts` file", which is red on a
   * correct artifact twice over: `@abuddy/cli` ships its pack templates as source on purpose, and `@abuddy/ui`'s
   * declarations are named `*.d.vue.ts`, which no `.d.ts` test matches.
   */
  it('ships no source directory', () => {
    const source = Object.entries(TREES).flatMap(([pkg, dir]) =>
      [...filesOf(dir)].filter((file) => file === 'src' || file.startsWith('src/')).map((file) => report(pkg, 'a packed file', file)));
    expect(source).toEqual([]);
  });

  /**
   * What stops the cases above passing by finding nothing. `@abuddy/cli`'s `bin` is `"bin/abuddy.mjs"` with no
   * `./`, so an extractor keyed on that prefix reports green over zero paths — and `bin` is the only path that
   * manifest names at all.
   */
  it('is checked over at least one path per package, and per field it declares', () => {
    const vacuous = Object.entries(TREES).flatMap(([pkg, dir]) => {
      const manifest = manifestOf(dir);
      const found = manifestPaths(manifest);
      if (found.length === 0) return [report(pkg, 'its whole manifest', 'names no path this case could check')];
      return PATH_FIELDS
        .filter((field) => field in manifest && !found.some(([what]) => what === field || what.startsWith(`${field}.`) || what.startsWith(`${field}[`)))
        .map((field) => report(pkg, field, 'is declared but contributed no path'));
    });
    expect(vacuous).toEqual([]);
  });
});
