// A fast staleness gate for the committed API reports (etc/*.api.md, etc/*.component.md).
//
// `api:check` is the authority, but it runs API Extractor over every entry: 46s for the three
// packages, 33s of it @abuddy/ui. That is too slow to sit in `npm run typecheck`, so before this
// existed the reports were guarded only by CI — and a public export could change without its report
// and nothing said so until CI ran.
//
// This is the cheap half. The reports are a pure function of the declarations API Extractor reads,
// so if those declarations have not changed, neither have the reports. Comparing them is a hash of
// ~230 files: milliseconds, against 46 seconds.
//
// WHAT IS HASHED, AND WHY IT IS `dist` AND NOT THE SOURCE
//
// API Extractor reads `.temp/api-types`, which `api:build` deletes and re-emits on every run, so it
// cannot be compared without paying the compile. `dist` holds the same declarations, persistently,
// and `packages:ensure` — already the first step of `npm run typecheck` — has rebuilt it by the time
// this runs. Hashing `src` instead would be wrong in the expensive direction: every edit to a
// function body would demand an `api:update` that changed nothing.
//
// Only `.ts` files under `dist` are hashed. That is the whole of it: `dist` holds `.d.ts` and, for
// @abuddy/ui's components, `.d.vue.ts` (the name TypeScript looks for under node16). `.js` is
// deliberately excluded — it changes when a function body changes, which is exactly the false alarm
// this is built to avoid. `.map` files are excluded too: they embed absolute paths.
//
// The declarations are hashed through `apiSurfaceOf`, which drops doc prose, for the same reason `.js`
// is excluded: prose reaches a `.d.ts` but cannot reach a report, so hashing it asked for an
// `api:update` that rewrote nothing. That trade is the one place this is not byte-exact — see the
// function's own comment for what was measured and what it gives up.
//
// Three measured properties of this repo, without which the gate is worthless:
//
//   - emit is deterministic: rebuilding a package with no source change gives the same fingerprint
//   - a body-only edit (a local added inside `randomId`) leaves the fingerprint byte-identical
//   - a doc comment's release tags and its presence do reach the report, so both are kept
//
// A package's own declarations are not enough: its reports name types from its @abuddy dependencies,
// which is why `tsconfig.api-extractor.json` resolves those to their built declarations. So a
// dependency's `dist` is hashed too, transitively. A change to @abuddy/ears therefore asks for an
// `api:update` of the SDK and UI as well. That is eager but not wrong — an ears type does surface in
// their reports — and ears changes are rare.
//
// THE STAMP IS COMMITTED, next to the reports it describes. A stamp under node_modules/.cache would
// be absent on a fresh clone, and the gate would have to either fail (blocking a checkout that is
// perfectly fine) or pass (leaving it blind until someone happened to run api:update once). Committed,
// it is right immediately after a clone, and a review sees "the declarations changed" beside the
// report diff. This is sound only because emit is reproducible, which is the first property above; if
// it ever stops being, the failure is a spurious "run api:update", never a missed change.
//
//   tsx scripts/api-report-stamp.ts packages/abuddy-sdk [--write]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fingerprintInputs } from '@abuddy/host/build/packages-built';
import { createHash } from 'node:crypto';
import { reportEntries, reportName } from './lib/api-entries.ts';

/** The file recording the fingerprint the committed reports were generated from */
export const stampFile = (pkgDir: string): string => path.join(pkgDir, 'etc', 'declarations.sha256');

/**
 * `@abuddy/x` → its workspace directory, as a sibling of the package that depends on it. Resolved
 * from the dependent rather than from this file's own location, so the rule holds wherever the
 * packages sit and a spec can point it at a fixture tree.
 */
function packageDir(name: string, fromPkgDir: string): string | undefined {
  const dir = path.resolve(fromPkgDir, '..', name.replace('@abuddy/', 'abuddy-'));
  return fs.existsSync(path.join(dir, 'package.json')) ? dir : undefined;
}

/** This package and every @abuddy package it depends on, transitively, nearest first */
export function declarationPackages(pkgDir: string, seen = new Set<string>()): string[] {
  const resolved = path.resolve(pkgDir);
  if (seen.has(resolved)) return [];
  seen.add(resolved);
  const pkg = JSON.parse(fs.readFileSync(path.join(resolved, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>; peerDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((name) => name.startsWith('@abuddy/'));
  return [resolved, ...deps.flatMap((name) => {
    const dir = packageDir(name, resolved);
    return dir ? declarationPackages(dir, seen) : [];
  })];
}

/** Every declaration file under a package's dist: `.d.ts`, and `.d.vue.ts` for UI components */
function declarationFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) declarationFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** The declarations this package's reports are generated from, its dependencies' included */
export function declarationInputs(pkgDir: string): string[] {
  return declarationPackages(pkgDir).flatMap((dir) => declarationFiles(path.join(dir, 'dist')));
}

/** A package's name, for naming it in a stamp and in a message */
function packageName(dir: string): string {
  return (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as { name: string }).name;
}

/** A TSDoc block comment, non-greedy so each is matched separately */
const DOC_COMMENT = /\/\*\*[\s\S]*?\*\//g;

/**
 * A declaration file as its API report sees it: doc comments reduced to their tag lines.
 *
 * Measured against API Extractor on `@abuddy/sdk` (2026-09-24): editing a doc comment's prose leaves
 * every report byte-identical, while changing a release tag (`@public` → `@internal`) and deleting a
 * comment altogether each change one — a report carries the tags and marks an undocumented export
 * `(undocumented)`. Prose is therefore the one part of a declaration that cannot move a report, and
 * hashing it made every comment edit in this comment-heavy repo demand a 46s `api:update` that rewrote
 * nothing but this stamp.
 *
 * So each comment becomes `/**` + its `@`-tag lines + `*\/`: the tags are kept verbatim, and an empty
 * pair of markers still distinguishes a documented export from an undocumented one. Keeping whole tag
 * lines rather than tag names is deliberate — it is the conservative side of a guess about what a
 * report renders, and a false "run api:update" costs a minute where a false "nothing changed" costs a
 * wrong report.
 *
 * What this gives up: the gate is no longer byte-exact, so a change hidden inside a `/** … *\/`
 * sequence within a string literal type would not be seen here. `api:check` is still the authority and
 * still runs in the full chain before a merge.
 */
export function apiSurfaceOf(declarations: string): string {
  return declarations.replace(DOC_COMMENT, (comment) => {
    const lines = comment.split('\n').map((line) => line.trim().replace(/^\*+\s?/, '').replace(/\s*\*\/$/, '').trim());
    return `/**${lines.filter((line) => /@\w/.test(line)).join('\n')}*/`;
  });
}

/**
 * One fingerprint per contributing package, nearest first: `<name> <hash of its own declarations>`.
 *
 * A single combined hash said only "something moved". Since a package's reports are generated from its
 * dependencies' declarations too, "ui is stale" was most often @abuddy/sdk's declarations moving, and
 * the message gave the reader no way to tell that from a change to @abuddy/ui itself — the last time it
 * happened here it was diagnosed by rebuilding UI and diffing, which measures the wrong input set.
 * Recording each contributor separately costs two lines and lets the message name the one that moved.
 */
export function declarationFingerprints(pkgDir: string): Array<{ name: string; hash: string }> {
  return declarationPackages(pkgDir).map((dir) => ({
    name: packageName(dir),
    hash: fingerprintInputs(declarationFiles(path.join(dir, 'dist')), (contents) => apiSurfaceOf(contents.toString('utf-8'))),
  }));
}

/**
 * The row that records *which* reports exist, beside the rows recording what they were generated from.
 *
 * A report is one per entry, so the set of entries is an input to the reports exactly as the declarations
 * are. Leaving it out is what let `./packs` be added to a map, pass this check, and be refused by
 * `api:check` for want of a report — the one thing this check promises cannot happen.
 */
const ENTRIES_ROW = '#entries';

function entriesFingerprint(pkgDir: string): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { exports?: Record<string, unknown> };
  const names = reportEntries(pkg).map(reportName).sort();
  return createHash('sha256').update(names.join('\n')).digest('hex');
}

/** The stamp file's contents: one `<name> <hash>` line per contributing package, plus the entry set */
export function declarationStamp(pkgDir: string): string {
  const rows = declarationFingerprints(pkgDir).map(({ name, hash }) => `${name} ${hash}`);
  return [...rows, `${ENTRIES_ROW} ${entriesFingerprint(pkgDir)}`].join('\n') + '\n';
}

function parseStamp(contents: string): Map<string, string> {
  const entries = contents.trim().split('\n').map((line) => line.trim().split(/\s+/));
  return new Map(entries.filter((parts) => parts.length === 2).map(([name, hash]) => [name, hash]));
}

/** Why the reports may be out of date, or null. Never throws. */
export function staleReason(pkgDir: string): string | null {
  const inputs = declarationInputs(pkgDir);
  if (inputs.length === 0) {
    return 'its declarations are not built (no dist); run npm run packages:build';
  }
  let contents: string | undefined;
  try {
    contents = fs.readFileSync(stampFile(pkgDir), 'utf-8').trim();
  } catch { /* missing or unreadable: the same as never stamped */ }
  if (!contents) return `no ${path.basename(stampFile(pkgDir))}; run npm run api:update`;

  const recorded = parseStamp(contents);
  // A stamp from before this recorded one hash and no names: it says nothing about which package moved,
  // so it is treated as no stamp rather than guessed at
  if (recorded.size === 0) return `${path.basename(stampFile(pkgDir))} predates per-package stamps; run npm run api:update`;

  // A stamp written before the entry set was an input says nothing about it, so it is stale for that
  // reason rather than silently passing on the input it does not carry
  if (!recorded.has(ENTRIES_ROW)) return `${path.basename(stampFile(pkgDir))} predates the entry set; run npm run api:update`;
  if (recorded.get(ENTRIES_ROW) !== entriesFingerprint(pkgDir)) {
    return 'its published entries changed, so a report is missing or orphaned; run npm run api:update';
  }

  const current = declarationFingerprints(pkgDir);
  const moved = current.filter(({ name, hash }) => recorded.get(name) !== hash).map(({ name }) => name);
  if (moved.length === 0) return null;
  const own = packageName(path.resolve(pkgDir));
  // Naming the dependency is the whole point: "ui is stale" and "ui is stale because @abuddy/sdk's
  // declarations changed" send the reader to different places
  const whose = moved.length === 1 && moved[0] === own ? 'its declarations' : `${moved.join(', ')}'s declarations`;
  return `${whose} changed since the reports were generated; run npm run api:update`;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const pkgDir = path.resolve(process.argv[2] ?? '');
  const name = (JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { name: string }).name;
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(stampFile(pkgDir)), { recursive: true });
    fs.writeFileSync(stampFile(pkgDir), declarationStamp(pkgDir));
    console.log(`${name}: recorded the declarations its API reports came from`);
  } else {
    const reason = staleReason(pkgDir);
    if (reason) {
      console.error(`${name}: ${reason}`);
      process.exit(1);
    }
    console.log(`${name}: API reports match its declarations`);
  }
}
