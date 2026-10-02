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
// The declarations are hashed verbatim. A normaliser that dropped doc prose lived here and was wrong;
// `declarationFingerprints` records what refuted it.
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
import { createRequire } from 'node:module';
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

/**
 * Not normalised for union order, which is worth knowing before diagnosing a mystery here.
 *
 * `tsc` prints an inferred union's members in the order it created the member types, and that order changes
 * between builds — measured 2026-09-28 on the pack's declaration bundles, where one file took five distinct
 * hashes in six builds. This hashes declaration text, so an @abuddy package whose `.d.ts` grew such a union
 * could make `api:stamp` move with no source change, failing `typecheck` with "run npm run api:update" for
 * nothing.
 *
 * It is not happening: `npm run check:repro` compared all five packages' `dist` across two builds and found
 * them identical, because those come from `tsc` directly rather than through the rollup-plugin-dts path where
 * this bites. So this is a recorded exposure, not a bug, and the fix if it ever fires is the one the emitter
 * already uses — `sortLiteralUnions` (`@abuddy/cli`'s `build/declaration-text.ts`).
 */
/**
 * One fingerprint per contributing package, nearest first: `<name> <hash of its own declarations>`.
 *
 * **Hashed verbatim, doc prose included, because prose reaches a report.** A normaliser here reduced each
 * comment to its `@`-tag lines, on a measurement that said editing prose leaves every report byte-identical.
 * That is true of a comment *above* an exported declaration, which API Extractor replaces with its tags — and
 * false of one *inside* a type literal, which is part of the type's printed text and is reproduced verbatim:
 * `etc/index.api.md` carries `SystemEvents`' interior comments word for word from
 * `src/framework/define-system.ts`. So the gate was blind to an edit that rewrites a reviewed report, which is
 * the one direction a proxy must not be wrong in.
 *
 * It was also arbitrary rather than merely lax: the normaliser kept any comment line matching `@\w`, to keep
 * tags, and in a repo whose prose names `@abuddy/*` packages constantly most prose lines matched. Whether a
 * comment edit moved the stamp depended on whether its sentences happened to mention a package.
 *
 * The cost of hashing verbatim is that any doc-comment edit in these packages asks for an `api:update` (~46s,
 * `@abuddy/ui` 33s of it) that rewrites no report. That is the side to be wrong on, and the trade this gate
 * already stated: a false "run api:update" costs a minute, a false "nothing changed" ships a wrong report. A
 * narrower rule would have to tell an interior comment from a leading one, which is a parse of the `.d.ts`
 * rather than a regex over it.
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
    hash: fingerprintInputs(declarationFiles(path.join(dir, 'dist'))),
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

/**
 * The producer itself: the API Extractor that writes the reports, and the tsconfig it is pointed at.
 * Either moves a report with no declaration and no entry changing — a path mapping added to the tsconfig,
 * or a version whose formatting differs — so both are inputs in the same sense the declarations are.
 *
 * Listed rather than captured. Capturing what the extractor reads was the first design and does not suit
 * this one: it reads the report it is comparing against, which would make the key circular; it reads
 * `.temp/api-types`, which is derived from `dist` and regenerated per run, where hashing `dist` is stabler
 * and says the same thing; and it reads TypeScript's `lib.*.d.ts`, which would put node_modules into a
 * reviewed file and churn it on every bump. Two named inputs cost twenty lines and no churn. What covers
 * the ones nobody named is the check in `api-reports.ts`, not this list.
 */
const PRODUCER_ROW = '#producer';

function producerFingerprint(pkgDir: string): string {
  const require = createRequire(import.meta.url);
  const version = (JSON.parse(fs.readFileSync(require.resolve('@microsoft/api-extractor/package.json'), 'utf-8')) as { version: string }).version;
  let tsconfig = '';
  try { tsconfig = fs.readFileSync(path.join(pkgDir, 'tsconfig.api-extractor.json'), 'utf-8'); } catch { /* none: nothing to hash */ }
  return createHash('sha256').update(`api-extractor ${version}\n${tsconfig}`).digest('hex');
}

function entriesFingerprint(pkgDir: string): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { exports?: Record<string, unknown> };
  const names = reportEntries(pkg).map(reportName).sort();
  return createHash('sha256').update(names.join('\n')).digest('hex');
}

/**
 * Every row a current stamp records: one per contributing package, then the entry set and the producer.
 *
 * **One definition, read by both halves**, which is what lets `staleReason` ask whether the recorded rows *are*
 * these rows rather than only looking up the ones it happens to name. It used to compute the set here and check
 * it there, so a row the format dropped stayed in every committed stamp, was looked up by nothing, and passed —
 * and a `#version` row was what stood in for noticing. Rows a reader does not recognise are now its own
 * evidence, which is the one thing that integer was doing that the hashes were not.
 *
 * It hands back the package rows beside the map because the two questions want different things: the set
 * comparison wants every row, and *which package moved* wants only the ones that are packages. Deriving the
 * second by filtering the first on a `#` prefix made a naming convention load-bearing, where the function that
 * produces package hashes already knows the answer.
 */
export function stampRows(pkgDir: string): { rows: Map<string, string>; packages: ReadonlyArray<{ name: string; hash: string }> } {
  const packages = declarationFingerprints(pkgDir);
  return {
    packages,
    rows: new Map([
      ...packages.map(({ name, hash }) => [name, hash] as const),
      [ENTRIES_ROW, entriesFingerprint(pkgDir)],
      [PRODUCER_ROW, producerFingerprint(pkgDir)],
    ]),
  };
}

/** The stamp file's contents: one `<name> <hash>` line per row `stampRows` defines */
export function declarationStamp(pkgDir: string): string {
  return [...stampRows(pkgDir).rows].map(([name, hash]) => `${name} ${hash}`).join('\n') + '\n';
}

function parseStamp(contents: string): Map<string, string> {
  const entries = contents.trim().split('\n').map((line) => line.trim().split(/\s+/));
  return new Map(entries.filter((parts) => parts.length === 2).map(([name, hash]) => [name, hash]));
}

/**
 * A row this stamp now records that the file does not — the half that makes *adding* an input invalidate.
 *
 * Every clause in `staleReason` looks a row up by a name this code computes, so a row the format has gained
 * compares equal to nothing: the record simply has no entry, and `undefined` is only a finding where
 * something asks for it. The package rows are asked for by name, `#entries` and `#producer` have clauses of
 * their own, and a *fourth* kind of row would have none — measured 2026-10-02, a row added to `stampRows`
 * passed all three packages' committed stamps, which is the hole a `#version` row was papering over.
 *
 * **Last, so the clauses above keep their own words.** A stamp written before `#producer` existed is better
 * described as "API Extractor or its tsconfig changed" than by anything general, and a package row that is
 * missing rather than moved is still that package's declarations. This only speaks for the rows nothing else
 * does.
 *
 * **No input can reach it today**, since today's rows are exactly those three kinds — so what watches it is
 * the edit that would make it fire: adding a row to `stampRows`, which
 * `api-report-stamp.spec.ts`'s *"partitions its rows into the packages it names and the rows it records
 * about itself"* already fails until someone says which group the new row is in. Mutate that map and both
 * fire together.
 */
const unrecordedRow = (pkgDir: string, recorded: Map<string, string>, current: Map<string, string>): string | null => {
  const unrecorded = [...current.keys()].filter((row) => !recorded.has(row));
  return unrecorded.length === 0 ? null
    : `${path.basename(stampFile(pkgDir))} records nothing for ${unrecorded.join(', ')}, which this stamp now has; run npm run api:update`;
};

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

  const { rows: current, packages } = stampRows(pkgDir);
  // **Both directions, because a `#version` row covered both.** Every check below looks a row up by a name
  // *this* code computes, so neither a row the format has dropped nor a row it has gained is read by
  // anything: the first passes because nothing asks for it, the second because an absent record compares
  // equal to nothing. Measured 2026-10-02, with only the first direction here: a row added to `stampRows`
  // passed all three packages' committed stamps — the same hole the version row was papering over, which is
  // what this file's own history is about. The row set is the data, so comparing it says which row it was.
  const unknown = [...recorded.keys()].filter((row) => !current.has(row));
  if (unknown.length > 0) {
    return `${path.basename(stampFile(pkgDir))} records ${unknown.join(', ')}, which this stamp no longer has; run npm run api:update`;
  }
  if (recorded.get(ENTRIES_ROW) !== current.get(ENTRIES_ROW)) {
    return 'its published entries changed, so a report is missing or orphaned; run npm run api:update';
  }
  if (recorded.get(PRODUCER_ROW) !== current.get(PRODUCER_ROW)) {
    return 'API Extractor or its tsconfig changed, which can move a report on its own; run npm run api:update';
  }

  // Over the package rows as `declarationFingerprints` produced them, not over the row map filtered by a naming
  // convention: a row added to `stampRows` without a `#` would then be reported as a package whose declarations
  // moved, and the function that knows which rows are packages is right there
  const moved = packages.filter(({ name, hash }) => recorded.get(name) !== hash).map(({ name }) => name);
  if (moved.length === 0) return unrecordedRow(pkgDir, recorded, current);
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
