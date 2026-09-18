#!/usr/bin/env node
/**
 * Keeps the packages `npm run packages:build` builds up to date with the sources they are built
 * from, building only when they aren't.
 *
 *   tsx scripts/ensure-packages-built.ts
 *
 * `@abuddy/cli`'s `published-*` specs read those packages' build output, so an edit to any source
 * that reaches it leaves them testing a stale build. This runs as that suite's `pretest`: one
 * process, before vitest starts, so no spec (and no vitest worker) ever builds. An up-to-date tree
 * pays a fingerprint of the build's inputs and nothing else, which is why CI's
 * `npm run packages:build` before the suite is not repeated here.
 *
 * ## Why a success stamp and not output mtimes
 *
 * "the output is newer than the sources" is not the question — "did a build of *these inputs*
 * succeed" is. A build starts by removing its output directory, and neither tsc nor tsdown nor
 * esbuild is transactional, so a failed or interrupted build leaves a complete-looking output tree
 * with current timestamps that reads as fresh forever. Output mtimes also move for reasons that are
 * not a build (a stray file, `.DS_Store`, another tool writing there), never move when a source is
 * *deleted*, tie on one-second-granularity filesystems, and a single future-dated source makes every
 * check report stale no matter how many times the build runs.
 *
 * So each unit of the build takes a lock, removes its stamp, builds, and — only when the build
 * returned — writes a stamp holding a content fingerprint of the inputs it was given
 * (`runPackageBuild`, which every build script wraps its work in). Freshness is then stamp
 * fingerprint === current fingerprint: a failed, killed or half-finished build has no stamp, a
 * deleted source changes the fingerprint, and nothing written into the output can forge one. The
 * fingerprint is computed inside the lock before the output is touched, so a source edited while the
 * build runs is recorded as *not* built.
 *
 * ## Input sets
 *
 * A unit's `inputs` need not name every file its output depends on, only the ones no other unit
 * covers: any stale unit reruns the whole `npm run packages:build`, so the CLI and testing bundles
 * (which inline `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/host` from source) list only
 * `@abuddy/host`, whose source no other unit watches.
 *
 * `tests/helpers/published-packages.ts` imports `stalePackageUnits()` for its own guard, so the
 * freshness rule has one definition: whatever this script considers fresh is what the specs accept.
 * The packages that helper npm-packs into consumer fixtures are its own list, deliberately separate:
 * widening what is watched here must never change what is published or packed.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

const repoFile = (...parts: string[]): string => path.join(REPO_ROOT, ...parts);
const pkgFile = (pkg: string, ...parts: string[]): string => repoFile('packages', pkg, ...parts);

/**
 * Inputs every unit's build reads: the root manifest (which defines `packages:build` itself), the
 * lockfile (the compilers and bundlers the build runs), and this file (which defines the input sets
 * and the stamp protocol, so changing it must invalidate every stamp).
 */
const SHARED_INPUTS = [repoFile('package.json'), repoFile('package-lock.json'), repoFile('scripts', 'ensure-packages-built.ts')];

/** One workspace of `npm run packages:build`: what its build reads, and what it writes. */
export interface BuildUnit {
  /** Files and directories the build reads, absolute. A directory is walked recursively. */
  readonly inputs: readonly string[];
  /** Paths the build writes; all must exist for the unit to count as built. */
  readonly outputs: readonly string[];
}

/**
 * The workspaces `npm run packages:build` builds, by workspace name.
 * `tests/build/package-freshness.spec.ts` checks these are exactly the ones that script names.
 */
export const BUILD_UNITS: Record<string, BuildUnit> = {
  '@abuddy/ears': {
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'lib', 'published-imports.ts'),
      pkgFile('abuddy-ears', 'src'), pkgFile('abuddy-ears', 'scripts'),
      pkgFile('abuddy-ears', 'package.json'), pkgFile('abuddy-ears', 'tsconfig.json'), pkgFile('abuddy-ears', 'tsconfig.package.json')],
    outputs: [pkgFile('abuddy-ears', 'dist')],
  },
  '@abuddy/sdk': {
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'lib', 'published-imports.ts'),
      pkgFile('abuddy-sdk', 'src'), pkgFile('abuddy-sdk', 'scripts'),
      pkgFile('abuddy-sdk', 'package.json'), pkgFile('abuddy-sdk', 'tsconfig.json'), pkgFile('abuddy-sdk', 'tsconfig.package.json')],
    outputs: [pkgFile('abuddy-sdk', 'dist')],
  },
  '@abuddy/ui': {
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'lib', 'published-imports.ts'),
      pkgFile('abuddy-ui', 'src'), pkgFile('abuddy-ui', 'scripts'), pkgFile('abuddy-ui', 'tsdown.config.ts'),
      pkgFile('abuddy-ui', 'package.json'), pkgFile('abuddy-ui', 'tsconfig.json'), pkgFile('abuddy-ui', 'tsconfig.package.json')],
    outputs: [pkgFile('abuddy-ui', 'dist')],
  },
  // The bundles inline @abuddy/host from source (scripts/bundle-package.ts), which no other unit watches
  '@abuddy/testing': {
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'bundle-package.ts'),
      pkgFile('abuddy-testing', 'src'), pkgFile('abuddy-testing', 'package.json'), pkgFile('abuddy-testing', 'tsconfig.json'),
      pkgFile('abuddy-host', 'src'), pkgFile('abuddy-host', 'package.json')],
    outputs: [pkgFile('abuddy-testing', 'dist', 'package', 'package.json'), pkgFile('abuddy-testing', 'dist', 'package', 'dist')],
  },
  '@abuddy/cli': {
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'bundle-package.ts'),
      pkgFile('abuddy-cli', 'src'), pkgFile('abuddy-cli', 'bin'), pkgFile('abuddy-cli', 'package.json'), pkgFile('abuddy-cli', 'tsconfig.json'),
      pkgFile('abuddy-host', 'src'), pkgFile('abuddy-host', 'package.json')],
    outputs: [pkgFile('abuddy-cli', 'dist', 'package', 'package.json'), pkgFile('abuddy-cli', 'dist', 'package', 'dist')],
  },
};

/** Where the stamps and the build lock live: outside every output tree, so a build can remove its own. */
export const STAMP_DIR = repoFile('node_modules', '.cache', 'abuddy-packages-build');

/** The stamp a workspace's successful build writes */
export const stampFile = (workspace: string): string => path.join(STAMP_DIR, `${workspace.replace(/[@/]/g, '-').replace(/^-/, '')}.json`);

/** Files under a watched input, relative to the repo, sorted. A file yields itself; a directory is walked. */
function inputFiles(target: string, out: string[] = []): string[] {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // A watched input that is not there contributes nothing and must not make the check throw;
    // creating it (or putting one back under a renamed config) changes the fingerprint by itself.
    return out;
  }
  if (stat.isFile()) {
    out.push(path.relative(REPO_ROOT, target));
    return out;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    // Dot files (editor and OS droppings) and installed modules are not sources of this build
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    inputFiles(path.join(target, entry.name), out);
  }
  return out;
}

/**
 * A content fingerprint of `inputs`: the sorted relative path of every file under them and its
 * bytes. Content, not mtimes — mtimes tie on coarse filesystems, move without an edit (a checkout,
 * a copy) and say nothing about a file that was deleted. Throws if an input cannot be read.
 */
export function fingerprintInputs(inputs: readonly string[]): string {
  const files = [...new Set(inputs.flatMap((target) => inputFiles(target)))].sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    const full = repoFile(file);
    // A file that is not there hashes as absent, never as empty: statSync above already reported it
    // missing, or it went between the two (a concurrent delete must not make the check throw)
    let contents: Buffer | null = null;
    try {
      contents = fs.readFileSync(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    hash.update(Buffer.from([contents === null ? 0 : 1]));
    if (contents !== null) hash.update(contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** A workspace whose build output does not match its sources, and why. */
export interface StaleUnit {
  readonly workspace: string;
  readonly reason: string;
}

/**
 * Why `unit` needs building, or null when its stamp says a build of exactly these inputs succeeded.
 * Never throws: an input that cannot be read is a reason to build, not a crash in the caller.
 */
export function unitStaleReason(unit: BuildUnit, stamp: string): string | null {
  const missing = unit.outputs.filter((output) => !fs.existsSync(output)).map((output) => path.relative(REPO_ROOT, output));
  if (missing.length > 0) return `not built (no ${missing.join(', ')})`;
  let stored: unknown;
  try {
    stored = JSON.parse(fs.readFileSync(stamp, 'utf-8')).fingerprint;
  } catch {
    stored = undefined;
  }
  if (typeof stored !== 'string') return 'no build stamp — never built by this script, or the last build failed or was interrupted';
  let current: string;
  try {
    current = fingerprintInputs(unit.inputs);
  } catch (err) {
    return `its sources could not be read (${(err as Error).message})`;
  }
  return stored === current ? null : 'its sources changed since the last successful build';
}

/** Every workspace of `packages:build` that needs building — empty when all of them are up to date. */
export function stalePackageUnits(): StaleUnit[] {
  return Object.entries(BUILD_UNITS).flatMap(([workspace, unit]) => {
    const reason = unitStaleReason(unit, stampFile(workspace));
    return reason === null ? [] : [{ workspace, reason }];
  });
}

/** The stale workspaces as lines, one reason each (any one of them rebuilds all of them). */
export function staleMessage(stale: readonly StaleUnit[]): string {
  return stale.map(({ workspace, reason }) => `  ${workspace}: ${reason}`).join('\n');
}

/** Thrown when `npm run packages:build` itself failed, so the caller doesn't report a check error as one. */
export class PackagesBuildFailed extends Error {
  constructor(readonly status: number) {
    super('npm run packages:build failed');
    this.name = 'PackagesBuildFailed';
  }
}

/** Builds the publishable packages when any is out of date. Throws `PackagesBuildFailed` if the build fails. */
export function ensurePackagesBuilt(): void {
  const stale = stalePackageUnits();
  if (stale.length === 0) return;
  // Synchronous: a message written just before the process exits must not sit in a pipe's buffer
  fs.writeSync(2, `Published packages are out of date:\n${staleMessage(stale)}\nRunning: npm run packages:build (which rebuilds all ${Object.keys(BUILD_UNITS).length})\n`);
  // npm is a shell script on Windows, which execFile cannot spawn without one
  const windows = process.platform === 'win32';
  try {
    // cwd, not a workspace flag: npm keeps its --workspace config out of a script's environment,
    // so this runs the repo's own packages:build even as @abuddy/cli's pretest.
    execFileSync(windows ? 'npm.cmd' : 'npm', ['run', 'packages:build'], { cwd: REPO_ROOT, stdio: 'inherit', shell: windows });
  } catch (err) {
    const status = (err as { status?: number }).status;
    throw new PackagesBuildFailed(typeof status === 'number' && status !== 0 ? status : 1);
  }
}

// ---------------------------------------------------------------------------
// The build side: the lock and the stamp every build script runs its work in.
// ---------------------------------------------------------------------------

const lockPath = (): string => path.join(STAMP_DIR, 'packages-build.lock');

interface LockHolder { pid: number; label: string; startedAt: string }

const readLock = (file: string): LockHolder | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
};

/** Whether a process still exists (EPERM means it does, under another user) */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Runs `run` with the repo's package-build lock held, so two builds never clear and rewrite the same
 * output at once (a developer's `npm run packages:build`, the CLI suite's pretest,
 * tests/scripts/test-packaged-authoring.sh). A lock whose process is gone — a killed build — is
 * taken over; a lock whose process is alive fails immediately, naming it, rather than waiting on it.
 */
export async function withBuildLock<T>(label: string, run: () => T | Promise<T>, file = lockPath()): Promise<T> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Written in full, then linked into place: link() fails with EEXIST when the lock is held, and a
  // reader never sees a half-written holder (which it would mistake for an abandoned lock).
  const pending = `${file}.${process.pid}`;
  fs.writeFileSync(pending, JSON.stringify({ pid: process.pid, label, startedAt: new Date().toISOString() }));
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        fs.linkSync(pending, file);
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        const holder = readLock(file);
        if (attempt > 0 || holder === null || alive(holder.pid)) {
          const who = holder === null ? 'an unreadable lock file' : `pid ${holder.pid} (${holder.label}, started ${holder.startedAt})`;
          throw new Error(`another package build holds ${path.relative(REPO_ROOT, file)}: ${who}. Wait for it to finish, then run this again.`);
        }
        fs.rmSync(file, { force: true }); // its process is gone
      }
    }
  } finally {
    fs.rmSync(pending, { force: true });
  }
  try {
    return await run();
  } finally {
    // Only if it is still ours: a build that overran a stolen lock must not delete the new holder's
    if (readLock(file)?.pid === process.pid) fs.rmSync(file, { force: true });
  }
}

/**
 * Runs `build` under the lock, between clearing the success stamp and writing a new one: the stamp
 * exists only where a build of exactly the fingerprinted inputs returned without throwing. The
 * fingerprint is taken before the build touches anything, so a source edited while it runs is
 * recorded as not built.
 */
export async function stampedBuild(
  label: string,
  unit: BuildUnit,
  stamp: string,
  build: () => void | Promise<void>,
  lock?: string,
): Promise<void> {
  await withBuildLock(label, async () => {
    const fingerprint = fingerprintInputs(unit.inputs);
    fs.rmSync(stamp, { force: true });
    await build();
    fs.mkdirSync(path.dirname(stamp), { recursive: true });
    fs.writeFileSync(stamp, `${JSON.stringify({ workspace: label, fingerprint, builtAt: new Date().toISOString() }, null, 2)}\n`);
  }, lock);
}

/** Every `build:package` script wraps its work in this. */
export async function runPackageBuild(workspace: string, build: () => void | Promise<void>): Promise<void> {
  const unit = BUILD_UNITS[workspace];
  if (!unit) throw new Error(`No build unit for ${workspace} in scripts/ensure-packages-built.ts`);
  await stampedBuild(workspace, unit, stampFile(workspace), build);
}

// Run as a script; imported (by the build scripts and the test helper) it only exports the check.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    ensurePackagesBuilt();
  } catch (err) {
    if (!(err instanceof PackagesBuildFailed)) throw err;
    // The build printed its own error; exit with its status rather than a stack trace over it.
    fs.writeSync(2, 'npm run packages:build failed — the packages are not built.\n');
    process.exitCode = err.status;
  }
}
