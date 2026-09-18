#!/usr/bin/env node
/**
 * Builds the publishable packages when their build output no longer matches the sources it was built
 * from. Runs as `@abuddy/cli`'s `pretest`, whose `published-*` specs read that output:
 *
 *   tsx scripts/ensure-packages-built.ts
 *
 * Freshness is a success stamp, not a timestamp. A build removes its output first and neither tsc nor
 * tsdown nor esbuild is transactional, so a failed or interrupted one leaves a complete-looking tree
 * that "output is newer than sources" reads as fresh forever; output mtimes also move for reasons that
 * aren't a build, never move when a source is deleted, and tie on coarse filesystems. So each build
 * runs through `runPackageBuild`, which writes a fingerprint of its inputs only once the build
 * returns, and fresh means that fingerprint still matches.
 *
 * A unit's `inputs` need only cover what no other unit does, since any stale unit rebuilds all of
 * them. `tests/helpers/published-packages.ts` reads the same verdict, so the specs accept exactly
 * what this builds.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const repoFile = (...parts: string[]): string => path.join(REPO_ROOT, ...parts);
const pkgFile = (pkg: string, ...parts: string[]): string => repoFile('packages', pkg, ...parts);

/** Read by every build: `packages:build` itself, the toolchain, and this file's input sets and stamp protocol */
const SHARED_INPUTS = [repoFile('package.json'), repoFile('package-lock.json'), repoFile('scripts', 'ensure-packages-built.ts')];

export interface BuildUnit {
  /** Files and directories the build reads, absolute; a directory is walked */
  readonly inputs: readonly string[];
  /** Paths the build writes; all must exist for the unit to count as built */
  readonly outputs: readonly string[];
}

/** A package compiled to its own `dist/` by `scripts/build-package.ts` */
function compiled(pkg: string, ...extraInputs: string[]): BuildUnit {
  return {
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'lib', 'published-imports.ts'), ...extraInputs,
      pkgFile(pkg, 'src'), pkgFile(pkg, 'scripts'),
      pkgFile(pkg, 'package.json'), pkgFile(pkg, 'tsconfig.json'), pkgFile(pkg, 'tsconfig.package.json')],
    outputs: [pkgFile(pkg, 'dist')],
  };
}

/** A package esbuild bundles into `dist/package/`, inlining @abuddy/host from source (scripts/bundle-package.ts) */
function bundled(pkg: string, ...extraInputs: string[]): BuildUnit {
  return {
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'bundle-package.ts'), ...extraInputs,
      pkgFile(pkg, 'src'), pkgFile(pkg, 'package.json'), pkgFile(pkg, 'tsconfig.json'),
      pkgFile('abuddy-host', 'src'), pkgFile('abuddy-host', 'package.json')],
    outputs: [pkgFile(pkg, 'dist', 'package', 'package.json'), pkgFile(pkg, 'dist', 'package', 'dist')],
  };
}

/** The workspaces `npm run packages:build` builds. `tests/build/package-freshness.spec.ts` pins this list against it. */
export const BUILD_UNITS: Record<string, BuildUnit> = {
  '@abuddy/ears': compiled('abuddy-ears'),
  '@abuddy/sdk': compiled('abuddy-sdk'),
  '@abuddy/ui': compiled('abuddy-ui', pkgFile('abuddy-ui', 'tsdown.config.ts')),
  '@abuddy/testing': bundled('abuddy-testing'),
  '@abuddy/cli': bundled('abuddy-cli', pkgFile('abuddy-cli', 'bin')),
};

/** Stamps and the build lock, outside every output tree so a build can remove its own */
const STAMP_DIR = repoFile('node_modules', '.cache', 'abuddy-packages-build');
const LOCK_FILE = path.join(STAMP_DIR, 'packages-build.lock');

export const stampFile = (workspace: string): string => path.join(STAMP_DIR, `${workspace.replace(/[@/]/g, '-').replace(/^-/, '')}.json`);

/** Files under a watched input, repo-relative. A missing input contributes nothing; creating it changes the fingerprint. */
function inputFiles(target: string, out: string[] = []): string[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return out;
  }
  if (stat.isFile()) return (out.push(path.relative(REPO_ROOT, target)), out);
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    // Dot files (editor and OS droppings) and installed modules are not sources of this build
    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') inputFiles(path.join(target, entry.name), out);
  }
  return out;
}

/** A content fingerprint of `inputs`: every file's repo-relative path and its bytes, sorted. */
export function fingerprintInputs(inputs: readonly string[]): string {
  const hash = createHash('sha256');
  for (const file of [...new Set(inputs.flatMap((target) => inputFiles(target)))].sort()) {
    // A file that goes between the walk and the read hashes as absent, never as empty
    let contents: Buffer | null = null;
    try {
      contents = fs.readFileSync(repoFile(file));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    hash.update(`${file}\0${contents === null ? 'absent' : contents.length}\0`);
    if (contents !== null) hash.update(contents);
  }
  return hash.digest('hex');
}

export interface StaleUnit { readonly workspace: string; readonly reason: string }

/** Why `unit` needs building, or null when its stamp says a build of exactly these inputs succeeded. Never throws. */
export function unitStaleReason(unit: BuildUnit, stamp: string): string | null {
  const missing = unit.outputs.filter((output) => !fs.existsSync(output)).map((output) => path.relative(REPO_ROOT, output));
  if (missing.length > 0) return `not built (no ${missing.join(', ')})`;
  let stored: unknown;
  try {
    stored = JSON.parse(fs.readFileSync(stamp, 'utf-8')).fingerprint;
  } catch { /* missing or unreadable: the same as never built */ }
  if (typeof stored !== 'string') return 'no build stamp — never built by this script, or the last build failed or was interrupted';
  try {
    return stored === fingerprintInputs(unit.inputs) ? null : 'its sources changed since the last successful build';
  } catch (err) {
    return `its sources could not be read (${(err as Error).message})`;
  }
}

/** Every workspace of `packages:build` that needs building — empty when all of them are up to date */
export function stalePackageUnits(): StaleUnit[] {
  return Object.entries(BUILD_UNITS).flatMap(([workspace, unit]) => {
    const reason = unitStaleReason(unit, stampFile(workspace));
    return reason === null ? [] : [{ workspace, reason }];
  });
}

export const staleMessage = (stale: readonly StaleUnit[]): string =>
  stale.map(({ workspace, reason }) => `  ${workspace}: ${reason}`).join('\n');

/** Whether a process still exists (EPERM means it does, under another user) */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

interface LockHolder { pid: number; label: string; startedAt: string }

function readLock(file: string): LockHolder | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Runs `run` holding the repo's package-build lock, so two builds never clear and rewrite the same
 * output at once. A lock whose process is gone is taken over; a live holder fails at once, naming it,
 * rather than waiting. Written then `link`ed, so a reader never sees a half-written holder and
 * mistakes it for an abandoned lock.
 */
export async function withBuildLock<T>(label: string, run: () => T | Promise<T>, file = LOCK_FILE): Promise<T> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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
        fs.rmSync(file, { force: true });
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
 * Runs `build` under the lock, between clearing the stamp and writing a new one, so the stamp exists
 * only where a build of exactly these inputs returned. The fingerprint is taken before the build
 * touches anything, so a source edited while it runs is recorded as not built.
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

/** Every `build:package` script wraps its work in this */
export async function runPackageBuild(workspace: string, build: () => void | Promise<void>): Promise<void> {
  const unit = BUILD_UNITS[workspace];
  if (!unit) throw new Error(`No build unit for ${workspace} in scripts/ensure-packages-built.ts`);
  await stampedBuild(workspace, unit, stampFile(workspace), build);
}

/** Thrown when the build itself failed, so the caller doesn't report a check error as one */
class PackagesBuildFailed extends Error {
  constructor(readonly status: number) {
    super('npm run packages:build failed');
  }
}

function ensurePackagesBuilt(): void {
  const stale = stalePackageUnits();
  if (stale.length === 0) return;
  // Synchronous: a message written just before the process exits must not sit in a pipe's buffer
  fs.writeSync(2, `Published packages are out of date:\n${staleMessage(stale)}\nRunning: npm run packages:build (which rebuilds all ${Object.keys(BUILD_UNITS).length})\n`);
  // npm is a shell script on Windows, which execFile cannot spawn without one
  const windows = process.platform === 'win32';
  try {
    // cwd, not a workspace flag: npm keeps --workspace out of a script's environment, so this runs
    // the repo's own packages:build even as @abuddy/cli's pretest
    execFileSync(windows ? 'npm.cmd' : 'npm', ['run', 'packages:build'], { cwd: REPO_ROOT, stdio: 'inherit', shell: windows });
  } catch (err) {
    const status = (err as { status?: number }).status;
    throw new PackagesBuildFailed(typeof status === 'number' && status !== 0 ? status : 1);
  }
}

// Run as a script; imported (by the build scripts and the test helper) it only exports
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    ensurePackagesBuilt();
  } catch (err) {
    if (!(err instanceof PackagesBuildFailed)) throw err;
    // The build printed its own error; exit with its status rather than a stack trace over it
    fs.writeSync(2, 'npm run packages:build failed — the packages are not built.\n');
    process.exitCode = err.status;
  }
}
