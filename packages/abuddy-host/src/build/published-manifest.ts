/**
 * The manifest a published tarball carries, derived from the workspace one, and what it may name.
 *
 * The workspace manifest cannot be published as it stands. Every export of `@abuddy/ears`, `@abuddy/sdk` and
 * `@abuddy/ui` names `./src/**` under the `@abuddy/source` condition, which `files` does not ship — 99 targets
 * measured 2026-09-27 — and Node picks a matching condition and *then* requires the file, with no fallback to
 * the next branch. So a consumer that enables the condition (a pack copying a config, a monorepo using the
 * same trick for its own packages) fails to resolve at all, with a message naming neither the condition nor
 * the config. The condition is a checkout-only mechanism, so the artifact does not mention it rather than
 * mentioning it as a trap: `@abuddy/testing`'s manifest has never had a source branch, and enabling the
 * condition against it resolves the same `dist` path as not enabling it.
 *
 * Derived at **build** time, into a staged tree the build writes. Not at publish time: `test-packaged-authoring.sh`
 * and `@app/publish-checks` both `npm pack` the tree, so a manifest written only by `npm publish` would be one
 * nothing ever packed, typechecked or installed. And not in a `prepack` hook: seven specs pack these packages
 * concurrently, so a hook rewriting `package.json` in place would race them.
 *
 * Here rather than in the repo's `scripts/` because four callers need it and a package may not reach into
 * `scripts/`: the two build scripts write the tree, `bundle-package.ts` checks its own generated manifest with
 * the same walk, and `@app/publish-checks` checks what `npm pack` would produce.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A parsed `package.json`. Only the fields below are read; the rest is copied through */
export type Manifest = Record<string, unknown>;

/** The condition under which a workspace export resolves TypeScript source, which no tarball holds */
const SOURCE_CONDITION = '@abuddy/source';

/** The directory inside a package that holds the staged tree npm publishes */
export const PUBLISH_TREE = 'publish';

/**
 * Fields a published manifest has no use for. `scripts` is the load-bearing one: with no scripts there is no
 * lifecycle hook to add, so the published manifest cannot become something that runs on install or rewrites
 * itself at pack time. `@app/publish-checks` asserts the absence rather than a list of hook names, which npm
 * is free to grow.
 */
const DROPPED_FIELDS = ['scripts', 'devDependencies'];

/** The manifest fields whose values are paths into the package. `files` holds globs, and is npm's business */
const PATH_FIELDS = ['exports', 'main', 'module', 'types', 'typings', 'browser', 'bin', 'typesVersions'];

/**
 * The workspace manifest as it is published: without the source condition, without an entry that condition was
 * the whole of, and without the fields above.
 *
 * An emptied entry is dropped rather than left as `{}`, and must not be given a published target instead.
 * `@abuddy/sdk`'s `./runtime/internals` is the case: `facade-gate.ts` reports a pack whose facade imports
 * something installed dependents cannot resolve, and it decides that by asking whether the entry has a
 * published target. Give it one and the gate goes quiet; drop the entry and the gate still reports, because an
 * absent entry is not resolvable either.
 */
export function publishedManifest(manifest: Manifest): Manifest {
  const published: Manifest = {};
  for (const [field, value] of Object.entries(manifest)) {
    if (DROPPED_FIELDS.includes(field)) continue;
    published[field] = field === 'exports' ? publishedExports(value) : value;
  }
  return published;
}

function publishedExports(exports: unknown): unknown {
  if (exports === null || typeof exports !== 'object' || Array.isArray(exports)) return exports;
  const kept = Object.entries(exports).flatMap(([subpath, target]) => {
    const published = withoutSourceCondition(target);
    return published === undefined ? [] : [[subpath, published] as const];
  });
  return Object.fromEntries(kept);
}

/** A target without its source branch, at any depth — `undefined` when that leaves nothing publishable */
function withoutSourceCondition(target: unknown): unknown {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return target;
  const kept = Object.entries(target).flatMap(([condition, value]) => {
    if (condition === SOURCE_CONDITION) return [];
    const published = withoutSourceCondition(value);
    return published === undefined ? [] : [[condition, published] as const];
  });
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

/**
 * Every path a manifest names, as `[what names it, the path]`: every condition at every depth, and `bin`,
 * which is how a package with no exports map (`@abuddy/cli`) names anything at all.
 *
 * The keys of an `exports`, `bin` or `typesVersions` object are subpaths, conditions, commands or version
 * ranges — only the values name files, so the walk reads values and never keys.
 */
export function manifestPaths(manifest: Manifest): [string, string][] {
  const found: [string, string][] = [];
  const walk = (node: unknown, what: string): void => {
    if (typeof node === 'string') found.push([what, node]);
    else if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${what}[${index}]`));
    else if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, `${what}.${key}`);
    }
  };
  for (const field of PATH_FIELDS) if (field in manifest) walk(manifest[field], field);
  return found;
}

/** Which of `PATH_FIELDS` a manifest declares: what a check over it should have found something for */
export function declaredPathFields(manifest: Manifest): string[] {
  return PATH_FIELDS.filter((field) => field in manifest);
}

/**
 * Whether `files` holds what a target names. A target with `*` is a pattern, so something must match it —
 * without that, a pattern nobody had thought about would pass every check by matching nothing.
 */
function shipped(files: ReadonlySet<string>, target: string): boolean {
  const wanted = target.replace(/^\.\//, '');
  if (!wanted.includes('*')) return files.has(wanted);
  const [before = '', after = ''] = wanted.split('*', 2);
  return [...files].some((file) => file.length >= before.length + after.length
    && file.startsWith(before) && file.endsWith(after));
}

/**
 * `<what names it> -> <target>` for every path the manifest names that is not in `files`, whose paths are
 * relative to the package root (what `npm pack --json` lists, and what `treeFiles()` walks).
 *
 * The one shared answer to "does this artifact name only what it holds", so the build's check on a staged tree
 * and the spec's check on a tarball cannot come to different conclusions.
 */
export function missingPublishedPaths(manifest: Manifest, files: ReadonlySet<string>): string[] {
  return manifestPaths(manifest)
    .filter(([, target]) => !shipped(files, target))
    .map(([what, target]) => `${what} -> ${target}`);
}

/** Every file under `dir`, relative to it and `/`-separated: a staged tree in the form `npm pack` reports */
export function treeFiles(dir: string): Set<string> {
  return new Set(fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => fs.statSync(path.join(dir, file)).isFile()));
}

/**
 * Writes `<pkgDir>/publish/`: the derived manifest and a copy of everything `files` names, which is the tree
 * npm publishes. Returns it.
 *
 * `files` is kept in the derived manifest rather than dropped, so packing is explicit: a tree with no `files`
 * falls back to gitignore rules, and this one sits inside a gitignored directory. Then it checks the result,
 * so a build that stages a short tree fails here rather than shipping a manifest pointing at nothing —
 * `@app/publish-checks` is the backstop, not the first line.
 */
export function stagePublishTree(pkgDir: string, manifest: Manifest): string {
  const name = String(manifest.name);
  const treeDir = path.join(pkgDir, PUBLISH_TREE);
  const files = manifest.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`${name} names no "files", so there is nothing to publish. A staged tree copies what files names.`);
  }
  fs.rmSync(treeDir, { recursive: true, force: true });
  fs.mkdirSync(treeDir, { recursive: true });
  for (const entry of files) {
    if (typeof entry !== 'string' || /[*?[\]{}]/.test(entry)) {
      throw new Error(`${name}'s "files" entry ${JSON.stringify(entry)} is a pattern, and a staged tree copies paths. `
        + 'Name the directory or the file, or teach stagePublishTree to expand it.');
    }
    const from = path.join(pkgDir, entry);
    if (!fs.existsSync(from)) throw new Error(`${name}'s "files" names ${entry}, which this build did not write`);
    fs.cpSync(from, path.join(treeDir, entry), { recursive: true });
  }
  const published = publishedManifest(manifest);
  fs.writeFileSync(path.join(treeDir, 'package.json'), `${JSON.stringify(published, null, 2)}\n`);
  const missing = missingPublishedPaths(published, treeFiles(treeDir));
  if (missing.length > 0) {
    throw new Error(`${name}'s published manifest names files the staged tree does not hold:\n`
      + `${missing.map((problem) => `  ${problem}`).join('\n')}\n`
      + 'Either "files" does not cover it, or the build did not write it.');
  }
  return treeDir;
}
