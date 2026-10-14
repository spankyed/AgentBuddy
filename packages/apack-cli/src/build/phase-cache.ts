/**
 * Content-keyed reuse of frontend bundles, facade types and DSL definitions.
 *
 * Keys cover authored pack files, generated entries, the phase's additional inputs, tools and options.
 * Diagnostic build-read records do not define this scope: additions must invalidate reuse even when
 * no previous build read them. Reused output is copied into the staged tree before publication, so
 * reuse produces the same output as running the phase. Release and development keys stay distinct.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { packInputsHash } from './pack-inputs.ts';
import { buildToolHash } from './tool-identity.ts';

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
 * `unitStaleReason` (`@apackdev/host/build/packages-built`): recording only the hash let a deleted output
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
 * The `@apackdev` packages a pack's frontend compiles against, as the pack itself resolves them — workspace
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
  for (const pkg of ['@apackdev/ears', '@apackdev/sdk', '@apackdev/ui']) {
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
 * `buildToolHash` covers the CLI's implementation; this covers installed bundling tools.
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
function hashTree(hash: ReturnType<typeof createHash>, dir: string): void {
  for (const file of filesUnder(dir)) {
    const content = fs.readFileSync(path.join(dir, file));
    hash.update(`${file.length}:${file}:${content.length}:`);
    hash.update(content);
  }
}

/** Hash the same DSL definitions the bundle resolves, whether staged or already published. */
export function feInputsHash(root: string, options: { readonly release: boolean; readonly definitionsDir?: string }, apackDirs: readonly string[]): string {
  return phaseInputsHash(root, { bundler: 'fe-bundler.ts', release: options.release,
    dirs: [options.definitionsDir ?? path.join(root, 'dist', 'defs'), ...apackDirs] });
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
  readonly depSnapshots?: ReadonlyMap<string, unknown>;
}): string {
  const hash = createHash('sha256');
  if (o.release !== undefined) hash.update(`release:${o.release}`);
  hash.update(o.bundler);
  hash.update(buildToolHash());
  hash.update(bundlerVersions());
  hash.update(packInputsHash(root, { generated: true }));
  for (const dir of o.dirs ?? []) hashTree(hash, dir);
  for (const id of [...(o.depSnapshots?.keys() ?? [])].sort()) {
    hash.update(id);
    hash.update(JSON.stringify(o.depSnapshots!.get(id)));
  }
  return hash.digest('hex');
}
