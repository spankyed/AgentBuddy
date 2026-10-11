/**
 * Reusing a build phase's output when nothing it reads has moved.
 *
 * **Three of `apack build`'s phases are expensive and read a bounded set of files** — the frontend
 * bundle, the facade types and the DSL defs — so a build whose pack sources have not changed can take the
 * previous build's output forward instead of making it again. Measured on the pack the app ships,
 * 2026-10-08: hashing the whole scope is **17-19ms over 705 files**, against 11.3s for the frontend bundle
 * alone, and a build whose pack has not changed goes **21.0s to 6.3s, -70%** with all three gated (paired
 * A/B, median of 3, 74% idle, 2026-10-08). What is left is the hash and the copy of what the phases
 * produced — 101 files and 8.5 MB for the pack the app ships.
 *
 * **Reuse, not skip.** `--skip-fe` omits the frontend from the published tree; this produces the same tree
 * either way, which is the whole requirement — `apack build` stages into `.apack/build/` and renames
 * that over `dist/`, so a phase that does not run still has to leave its files in the staged tree.
 * Everything here exists to make the two trees identical, not to leave one short.
 *
 * **It is a content key over a declared scope, which is what makes it sound.** The build also records what
 * each phase *read* (`build-reads.ts`), and that record is explicitly never a cache key: a dep file can be
 * stale about a read nobody has made yet. A scope is the other half of the root guide's rule — *"a key
 * that cannot go stale, or a scope in which it cannot"* — because it hashes the tree rather than the reads,
 * so a file nobody touched last time is still in it. The reads record is how the scopes below were checked
 * against reality rather than guessed: measured 2026-10-08, the frontend phase read 329 files under the
 * pack's `src/` and 84 in the `@apack` packages' `dist`, and no others.
 *
 * **What the hash must cover besides the inputs is the options that change the output.** A `--release`
 * build minifies and drops sourcemaps, so reusing a development build's bundle for it would publish the
 * wrong bytes under the right name — the one failure here that no missing-file check could catch.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cliVersion } from '../utils';

/** Where the stamps live: beside `reads.json`, in the directory every pack already ignores */
const CACHE_FILE = path.join('.apack', 'build-cache.json');

export interface PhaseStamp {
  /** What the phase read, and the options that change what it writes */
  readonly hash: string;
  /**
   * What it wrote, relative to `dist`. **Recorded rather than fixed**, because a phase's output set
   * follows the pack: the frontend bundle emits a chunk per lazy import, so a hard-coded list would be
   * wrong for every pack but the one it was written against.
   */
  readonly files: readonly string[];
}

export type PhaseStamps = Readonly<Record<string, PhaseStamp>>;

export function readStamps(root: string): PhaseStamps {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(root, CACHE_FILE), 'utf-8'));
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as PhaseStamps;
  } catch {
    // Absent or unreadable is simply no record, which reads as every phase stale
    return {};
  }
}

/**
 * Records the stamps. **Called with the snapshot and never per phase**, for the reason `reads.write()` is:
 * a build that failed produced no output to reuse, so it must leave the last complete record in place
 * rather than a record of the half it managed.
 */
export function writeStamps(root: string, stamps: PhaseStamps): void {
  const file = path.join(root, CACHE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(stamps, null, 2)}\n`);
}

/**
 * Why a phase's recorded output cannot be taken forward, or `null` when it can.
 *
 * Two questions rather than one, which is the shape of `generate-entries`' `staleReason` and
 * `unitStaleReason` (`@apack/host/build/packages-built`): recording only the hash let a deleted output
 * read as current, there and here.
 *
 * **The order is the opposite of those two, deliberately.** They ask about missing output first because a
 * missing file was the silent-success bug they were written for. Here either answer rebuilds, so the order
 * decides only the message — and "inputs changed" is the expected one, worth saying plainly, while output
 * that has gone missing under an unchanged hash is the surprise worth naming on its own.
 */
export function reuseProblem(stamp: PhaseStamp | undefined, distDir: string, hash: string): string | null {
  if (!stamp) return 'no record of the last build';
  if (stamp.hash !== hash) return 'inputs changed';
  const missing = stamp.files.filter((file) => !fs.existsSync(path.join(distDir, file)));
  if (missing.length > 0) return `missing ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`;
  return stamp.files.length > 0 ? null : 'recorded no output';
}

/** Every file under `dir`, relative to it, sorted — the listing a phase's output set is read from */
export function filesUnder(dir: string, base = dir, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

/** Copies a phase's recorded output from `dist` into the staged tree, at the same relative paths */
export function takeForward(distDir: string, stagedDir: string, files: readonly string[]): void {
  for (const file of files) {
    const to = path.join(stagedDir, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(distDir, file), to);
  }
}

/**
 * The implementation of the phase, so an edit to a bundler invalidates what it produced. Workspace source
 * first, then the published bundle, then the version — the three cases and the order are `codegenSource()`'s
 * in `generate-entries.ts`, for the same reason: in a checkout the version does not move when the code does.
 */
function bundlerSource(file: string): string {
  const candidate = path.join(import.meta.dirname, file);
  if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf-8');
  return cliVersion() ?? '';
}

/**
 * The `@apack` packages a pack's frontend compiles against, as the pack itself resolves them — workspace
 * source in a checkout, `node_modules` in an installed pack, which is the one layout a pack author has.
 *
 * **A package it cannot find is a refusal, not an omission.** Leaving one out of the scope would mean an
 * upgrade to it did not invalidate anything, and the build would take a bundle forward that was compiled
 * against the version before. `packagesBuiltOrRefuse` is the same shape: where the evidence is missing, say
 * so rather than answer from what is left.
 */
export function apackScope(packDir: string): { readonly dirs: readonly string[] } | { readonly missing: readonly string[] } {
  const require = createRequire(path.join(packDir, 'noop.js'));
  const dirs: string[] = [];
  const missing: string[] = [];
  for (const pkg of ['@apack/ears', '@apack/sdk', '@apack/ui']) {
    try {
      dirs.push(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'dist'));
    } catch {
      missing.push(pkg);
    }
  }
  return missing.length > 0 ? { missing } : { dirs };
}

/**
 * The versions of the tools that do the bundling, so upgrading one invalidates what it produced.
 *
 * **Deliberately one set for every phase rather than per phase.** A typescript bump invalidating the
 * frontend bundle costs one rebuild; the other error — a phase reusing output a different bundler made —
 * is silent, and over-broad is the safe direction for a cache key. Before reuse existed this needed no
 * answer at all, because the bundler always ran.
 *
 * `bundlerSource` covers the CLI's own code; this covers what it calls.
 */
function bundlerVersions(): string {
  const require = createRequire(import.meta.url);
  return ['vite', 'rollup', 'esbuild', 'typescript'].map((pkg) => {
    try {
      return `${pkg}@${(JSON.parse(fs.readFileSync(require.resolve(`${pkg}/package.json`), 'utf-8')) as { version?: string }).version ?? '?'}`;
    } catch {
      return `${pkg}@absent`;
    }
  }).join(',');
}

/** Hashable file lists, each a scope rather than a list of reads */
function hashTree(hash: ReturnType<typeof createHash>, dir: string, keep: (name: string) => boolean): void {
  for (const file of filesUnder(dir)) {
    if (!keep(path.basename(file))) continue;
    hash.update(file);
    hash.update(fs.readFileSync(path.join(dir, file)));
  }
}

const SOURCE = /\.(ts|tsx|js|mjs|cjs|vue|json|css)$/;

/**
 * The frontend bundle's scope: the pack's own sources — `src/__generated__` included, since the entry it
 * bundles is generated — its build inputs, the DSL defs it resolves `?raw` from the real `dist`, and the
 * `@apack` packages it compiles against, which are what the recorded reads showed it reaching outside the
 * pack.
 */
export function feInputsHash(root: string, options: { readonly release: boolean }, apackDirs: readonly string[]): string {
  // `dist/defs` because the bundle resolves the DSL defs from the pack's real dist as `?raw`
  return phaseInputsHash(root, { bundler: 'fe-bundler.ts', release: options.release, dirs: apackDirs, trees: ['dist/defs'] });
}

/** The facade types a dependent compiles against: the pack's own sources, and what it compiles them with */
export function typesInputsHash(root: string, depSnapshots: ReadonlyMap<string, unknown>): string {
  return phaseInputsHash(root, { bundler: 'types-bundler.ts', depSnapshots });
}

/** The DSL defs: the manifest's `dsl` entries, the sources they name, and the packages their types come from */
export function dslInputsHash(root: string, apackDirs: readonly string[]): string {
  return phaseInputsHash(root, { bundler: 'dsl-defs.ts', dirs: apackDirs });
}

/**
 * One hash for every gated phase: the pack's own sources and build inputs, whatever else the phase reaches,
 * the implementation that produces it, and the options that change what it writes.
 */
function phaseInputsHash(root: string, o: {
  readonly bundler: string;
  readonly release?: boolean;
  readonly dirs?: readonly string[];
  readonly trees?: readonly string[];
  readonly depSnapshots?: ReadonlyMap<string, unknown>;
}): string {
  const hash = createHash('sha256');
  if (o.release !== undefined) hash.update(`release:${o.release}`);
  hash.update(bundlerSource(o.bundler));
  hash.update(bundlerVersions());
  for (const file of ['apack.json', 'package.json', 'tsconfig.json', 'tailwind.config.ts', 'tailwind.config.js']) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) { hash.update(file); hash.update(fs.readFileSync(full)); }
  }
  hashTree(hash, path.join(root, 'src'), (name) => SOURCE.test(name));
  for (const tree of o.trees ?? []) hashTree(hash, path.join(root, tree), () => true);
  for (const dir of o.dirs ?? []) hashTree(hash, dir, (name) => SOURCE.test(name));
  for (const id of [...(o.depSnapshots?.keys() ?? [])].sort()) {
    hash.update(id);
    hash.update(JSON.stringify(o.depSnapshots!.get(id)));
  }
  return hash.digest('hex');
}
