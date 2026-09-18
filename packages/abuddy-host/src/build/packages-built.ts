/**
 * Whether the publishable packages' build output still matches the sources it was built from, and the
 * build that refreshes it. `scripts/ensure-packages-built.ts` is the command over this module, run as
 * `npm run packages:ensure` and as `@abuddy/cli`'s `pretest`, whose `published-*` specs read that output.
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
import { fileURLToPath } from 'node:url';

/**
 * The file whose presence says a directory is an AgentBuddy checkout, not an installed package: this
 * module's own source. It names itself on purpose. A marker somewhere else looks correct after that file
 * is renamed, and the guard then reads every checkout as an installed package and quietly does nothing —
 * so the only way to break this one is to move the file holding the constant that names it.
 * `package-freshness.spec.ts` asserts it resolves in this repo, so a move fails a test rather than a run.
 */
export const CHECKOUT_MARKER = path.join('packages', 'abuddy-host', 'src', 'build', 'packages-built.ts');

/**
 * The checkout this file belongs to, found by walking up from wherever it runs. Bundlers inline this
 * module into packages that ship elsewhere (@abuddy/testing's harness, @abuddy/cli), so a root derived
 * from this file's own location would point inside that bundle; walking up finds the checkout when
 * there is one. With no checkout above it there is nothing to be stale against, and the only caller
 * that runs there (`assertCheckoutPackagesFresh`) tests for the marker below before reading anything.
 */
function findCheckoutRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, CHECKOUT_MARKER))) return dir;
  }
  return path.dirname(fileURLToPath(import.meta.url));
}

export const REPO_ROOT = findCheckoutRoot();
const repoFile = (...parts: string[]): string => path.join(REPO_ROOT, ...parts);
const pkgFile = (pkg: string, ...parts: string[]): string => repoFile('packages', pkg, ...parts);

/** Read by every build: `packages:build` itself, the toolchain, and this file's input sets and stamp protocol */
const SHARED_INPUTS = [repoFile('package.json'), repoFile('package-lock.json'),
  repoFile('packages', 'abuddy-host', 'src', 'build', 'packages-built.ts'), repoFile('scripts', 'ensure-packages-built.ts')];

export interface BuildUnit {
  /** Files and directories the build reads, absolute; a directory is walked */
  readonly inputs: readonly string[];
  /** Paths the build writes; all must exist for the unit to count as built */
  readonly outputs: readonly string[];
}

/** A package compiled to its own `dist/` by `scripts/build-package.ts` (or, for @abuddy/ui, build-ui-package.ts) */
function compiled(pkg: string, ...extraInputs: string[]): BuildUnit {
  return {
    // The build scripts live in the repo's scripts/, not the package's: a package's own scripts are its
    // other tooling (the SDK's schema generator) and no input of this build, bar @abuddy/ui's exports
    inputs: [...SHARED_INPUTS, repoFile('scripts', 'lib', 'published-imports.ts'), repoFile('scripts', 'build-package.ts'), ...extraInputs,
      pkgFile(pkg, 'src'),
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
  '@abuddy/ui': compiled('abuddy-ui', pkgFile('abuddy-ui', 'tsdown.config.ts'), repoFile('scripts', 'build-ui-package.ts'),
    pkgFile('abuddy-ui', 'scripts', 'exports.ts')),
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

/**
 * The build running right now, if one is. A reader of the stamps needs this: a build removes each stamp
 * before it rewrites it, so anything checking freshness while one runs sees units that look unbuilt and
 * would otherwise report them as stale, telling the reader to run the build that is already running.
 */
export function runningPackageBuild(file = LOCK_FILE): { pid: number; label: string; startedAt: string } | undefined {
  const holder = readLock(file);
  return holder && alive(holder.pid) ? holder : undefined;
}

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
  if (!unit) throw new Error(`No build unit for ${workspace} in BUILD_UNITS (@abuddy/host/build/packages-built)`);
  await stampedBuild(workspace, unit, stampFile(workspace), build);
}

/** Thrown when the build itself failed, so the caller doesn't report a check error as one */
export class PackagesBuildFailed extends Error {
  constructor(readonly status: number) {
    super('npm run packages:build failed');
  }
}

/** Builds every publishable package when any of them is stale; a no-op when they are all up to date */
export function ensurePackagesBuilt(): void {
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
