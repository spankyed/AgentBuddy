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
import * as os from 'node:os';
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

/**
 * Read by every build: the scripts that run it and the toolchain it runs with. This module is not among
 * them — it decides *whether* to build and cannot change what a build emits, so it is the cache's
 * implementation rather than an input. Its two jobs that do affect a verdict are covered without it:
 * `STAMP_VERSION` invalidates every stamp when the protocol changes, and each unit's declared paths are
 * part of its own fingerprint, so editing one unit's input set invalidates that unit alone.
 */
const SHARED_INPUTS = [repoFile('package.json'), repoFile('package-lock.json')];

/**
 * The stamp format, shared by everything that records "this ran over exactly these inputs" — the package
 * builds and, through `stampedRun`, the chain's steps. Bump it when a stamp written by an older run would
 * be read wrongly by this one (a different hash, a different set of things hashed), and every unit runs
 * once, which is correct.
 *
 * Back at 1 deliberately. Stamps live in `node_modules/.cache/` and are never committed, so a version only
 * means something against stamps a machine already has; the bumps taken while the chain's steps were being
 * added to this protocol meant nothing to anyone but the machine they were written on. The protocol this
 * describes is one thing, so it starts at one, and `!==` still invalidates whatever those runs left behind.
 */
export const STAMP_VERSION = 1;

export interface BuildUnit {
  /** Files and directories the build reads, absolute; a directory is walked */
  readonly inputs: readonly string[];
  /**
   * Trees inside `inputs` that are not part of the fingerprint, and are not this unit's own output either:
   * generated files it declares the parent of but never reads. `typecheck` declares `tests/fixtures` for
   * the pack sources and does not read the packs' build output — `check:specifiers` filters
   * `__generated__` out itself — so hashing that output would tie this unit's freshness to a build it does
   * not depend on.
   *
   * Distinct from `outputs`, which must exist for the unit to count as built. An exclusion need not exist.
   */
  readonly excludes?: readonly string[];
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
/** How long a `freshness` fix waits for a live holder, and how often it looks. A bound, not a schedule: it
 *  returns the moment the holder is gone. A minute against a longest-unit build of ~15s: four times what
 *  the thing being waited for costs, so a wedged holder is reported in a minute rather than held for ten.
 *  A bound nobody will wait for is the same as no bound. */
const LOCK_WAIT_MS = 60_000;
const LOCK_POLL_MS = 200;

export const stampFile = (workspace: string): string => path.join(STAMP_DIR, `${workspace.replace(/[@/]/g, '-').replace(/^-/, '')}.json`);

/**
 * Every file under a path, repo-relative — the walk a fingerprint is taken over. Exported because the
 * chain's input-coverage guard has to resolve a step's inputs exactly as a fingerprint does: a guard that
 * walked differently would pass files a fingerprint never hashed.
 */
export function inputFiles(target: string, out: string[] = []): string[] {
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

/**
 * A content fingerprint of `inputs`: every file's repo-relative path and its bytes, sorted.
 *
 * It reads every byte, and that has been proposed twice as the thing to optimise — record each input's
 * `(size, mtimeNs)` in the stamp and skip the hashing when they all match, as Bazel and Turborepo do.
 * Measured on this repo before taking that trade:
 *
 *     417 files, 2.5MB      walk (readdir) 3ms | stat every file 1ms | walk + hash 24ms
 *     npm run packages:ensure, everything fresh: 345ms
 *
 * So the hashing is 24ms of a 345ms command; the other 320ms is the npm spawn, node and tsx starting,
 * and modules loading. Stat-before-hash would save about 20ms, in exchange for a cache key that is right
 * unless a file changes content while keeping its size and timestamp. Bazel makes that trade over
 * gigabytes and thousands of targets; over 2.5MB it buys 6% of one command. Not worth it — if this cost
 * ever matters, the 320ms of process startup is the part to attack, by calling `stalePackageUnits()`
 * from a process that is already running rather than spawning one.
 *
 * Note this is a different question from the one the header answers. There, mtimes are rejected for
 * deciding whether *output* is current, where a failed build leaves a complete-looking tree that reads
 * as fresh forever. Here they would be a cache key over *inputs*, which is sound in principle — the
 * reason not to is the arithmetic above, not the same objection.
 *
 * `normalise` hashes each file through a transform instead of as it is read, for a caller asking a
 * narrower question than "did these bytes change" — the API report stamp asks "could these declarations
 * have changed a report", and a doc comment's prose cannot.
 */
export function fingerprintInputs(
  inputs: readonly string[],
  normalise?: (contents: Buffer, file: string) => Buffer | string,
  exclude: readonly string[] = [],
): string {
  const hash = createHash('sha256');
  const excluded = exclude.map((target) => path.relative(REPO_ROOT, target));
  const isExcluded = (file: string): boolean => excluded.some((out) => file === out || file.startsWith(`${out}/`));
  for (const file of [...new Set(inputs.flatMap((target) => inputFiles(target)))].sort().filter((f) => !isExcluded(f))) {
    // A file that goes between the walk and the read hashes as absent, never as empty
    let contents: Buffer | null = null;
    try {
      contents = fs.readFileSync(repoFile(file));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    // Without a normaliser the bytes are hashed as read — no copy on the path that runs per command
    const hashed = contents !== null && normalise ? Buffer.from(normalise(contents, file)) : contents;
    hash.update(`${file}\0${hashed === null ? 'absent' : hashed.length}\0`);
    if (hashed !== null) hash.update(hashed);
  }
  return hash.digest('hex');
}

/**
 * A unit's fingerprint: the paths it declares, and the bytes under its inputs. The paths are in it so a
 * unit that gains or loses a watched directory invalidates itself — and only itself. Hashing the input
 * contents alone would read the new set against the old stamp and call it fresh.
 */
export function fingerprintUnit(unit: BuildUnit): string {
  const declared = [...unit.inputs, ...unit.outputs, ...(unit.excludes ?? [])].map((target) => path.relative(REPO_ROOT, target)).sort();
  return createHash('sha256')
    .update(declared.join('\0'))
    .update('\0')
    // A unit's own output is never its own input, however broadly its inputs are declared. Two steps
    // declare a whole tree and then write into it — `compile` writes `src/__generated__` under the `src`
    // it reads, and the fixture-pack check writes each pack's `dist` under the `tests/fixtures` it reads —
    // which makes them self-invalidating the moment their build stops being byte-identical. Both were
    // surviving on the builds happening to be deterministic, and the pack build is already known not to be
    // (two lines of `Omit<…>` union ordering). Excluding self-output here means declaring `outputs`
    // honestly is the whole fix, rather than every such step needing its inputs hand-narrowed.
    .update(fingerprintInputs(unit.inputs, undefined, [...unit.outputs, ...(unit.excludes ?? [])]))
    .digest('hex');
}

export interface StaleUnit { readonly workspace: string; readonly reason: string }

/**
 * Why `unit` needs to run, or null when its stamp says a run over exactly these inputs succeeded. Never
 * throws. The wording is deliberately not about building: the chain's steps go through this too, and most
 * of them are checks that produce nothing (`stampedRun`, `scripts/chain.ts`).
 */
export function unitStaleReason(unit: BuildUnit, stamp: string): string | null {
  const missing = unit.outputs.filter((output) => !fs.existsSync(output)).map((output) => path.relative(REPO_ROOT, output));
  if (missing.length > 0) return `not built (no ${missing.join(', ')})`;
  let record: { fingerprint?: unknown; version?: unknown } = {};
  try {
    record = JSON.parse(fs.readFileSync(stamp, 'utf-8'));
  } catch { /* missing or unreadable: the same as never built */ }
  if (typeof record.fingerprint !== 'string') return 'no stamp — it has not run yet, or the last run failed or was interrupted';
  // A stamp from another protocol says nothing about this one, so it counts as never built
  if (record.version !== STAMP_VERSION) return `its stamp is from another format (${String(record.version)}, this is ${STAMP_VERSION})`;
  try {
    return record.fingerprint === fingerprintUnit(unit) ? null : 'its inputs changed since the last successful run';
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

interface LockHolder { pid: number; label: string; startedAt: string }

/**
 * Whether the build that took the lock is still running: its pid exists, and it started in this boot.
 *
 * The same rule as `recordIsStale` in `@abuddy/host/process-liveness`, deliberately not that function. This module is
 * the freshness rule the package builds themselves run through, so it resolves the packages' published
 * `dist` — which, while they are being built, is the stale copy that has yet to export anything new. It
 * bounds by the lock's own `startedAt` rather than a file's mtime, which is the better of the two rules:
 * an mtime is whatever last touched the file, a recorded `startedAt` is the writer saying when it began.
 */
function holderIsRunning(holder: LockHolder): boolean {
  try {
    process.kill(holder.pid, 0);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  // Pids are recycled: after a reboot a crashed build's lock names whatever took its number
  const startedAt = Date.parse(holder.startedAt);
  return Number.isFinite(startedAt) && startedAt >= Date.now() - os.uptime() * 1000;
}

/**
 * The build running right now, if one is. A reader of the stamps needs this: a build removes each stamp
 * before it rewrites it, so anything checking freshness while one runs sees units that look unbuilt and
 * would otherwise report them as stale, telling the reader to run the build that is already running.
 */
export function runningPackageBuild(file = LOCK_FILE): { pid: number; label: string; startedAt: string } | undefined {
  const holder = readLock(file);
  return holder && holderIsRunning(holder) ? holder : undefined;
}

/** A synchronous pause, for the module-level readers below, which cannot await */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Waits for an in-flight package build to finish, and returns the build it waited for. A reader of the
 * stamps wants this rather than `runningPackageBuild` alone: a build removes each stamp before rewriting
 * it, so a reader that checks freshness mid-build sees units that look unbuilt and reports them stale,
 * telling the reader to run the build that is already running. Waiting turns that into the pause it
 * actually is — the point at which two suites can share one checkout.
 *
 * It waits on the lock rather than on the stamps, because only the lock says a build is in progress; a
 * missing stamp cannot tell "being rebuilt now" from "never built". The timeout is a bound, not a
 * schedule: it returns as soon as the holder is gone, and a holder that outlives it leaves the caller to
 * report staleness as before, which is the pre-existing behaviour rather than a hang.
 */
export function waitForPackageBuild({ timeoutMs = LOCK_WAIT_MS, pollMs = LOCK_POLL_MS }: { timeoutMs?: number; pollMs?: number } = {}): LockHolder | undefined {
  const waitedFor = runningPackageBuild();
  if (!waitedFor) return undefined;
  const deadline = Date.now() + timeoutMs;
  while (runningPackageBuild() && Date.now() < deadline) sleepSync(pollMs);
  return waitedFor;
}

/**
 * Whether every build unit's output exists — the question a spec that reads the built packages asks before
 * it runs — refusing outright when what is there is stale.
 *
 * Checker 6 of the package-freshness doors (they are listed in `packages/abuddy-testing/CLAUDE.md`). A
 * suite's `pretest` builds what is stale; this is what catches a run that bypassed it (`npx vitest`, a
 * watch run), and it refuses rather than testing output that no longer matches the source beside it.
 * Importing it never builds — that is the pretest's job, in its own process.
 *
 * `buildCommand` is the caller's own way of getting them built, because a message naming another package's
 * command sends the reader somewhere they have no reason to be.
 */
export function packagesBuiltOrRefuse(buildCommand: string): boolean {
  // Another process may be building right now, and a build removes each output and stamp before rewriting
  // it: both checks below would then read a half-built tree and refuse — which is what made a suite
  // started alongside `test:external-pack` fail about the race rather than about the code. Waiting is what
  // lets two suites share one checkout.
  waitForPackageBuild();
  const built = Object.values(BUILD_UNITS).every((unit) => unit.outputs.every((output) => fs.existsSync(output)));
  if (!built && process.env.CI) {
    throw new Error(`Specs that read the built packages need them built in CI. Run: ${buildCommand}`);
  }
  const stale = built ? stalePackageUnits() : [];
  if (stale.length > 0) {
    throw new Error(`The published packages are out of date:\n${staleMessage(stale)}\nRun: ${buildCommand}`);
  }
  return built;
}

function readLock(file: string): LockHolder | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Why this process wants to build, which decides what it does when another build already holds the lock.
 *
 * A `command` is someone asking for a build — `npm run packages:build`, `abuddy build`. It fails at once
 * naming the holder, because the person wants to know, and it builds whether or not the output is already
 * fresh, because they asked for a build.
 *
 * A `freshness` fix is a process that wants the packages *built* and does not care who builds them — a
 * suite's pretest, `ensurePackagesBuilt`. It waits for a live holder rather than failing, and once it has
 * the lock it checks again, because the build it waited for has very likely just done the work. Without
 * that second check the waiting only moves the duplicate build later; without the wait, two processes that
 * both found the same units stale race, and the one that reaches the lock second fails on a lock rather
 * than on anything about the code.
 */
export type BuildIntent = 'command' | 'freshness';

/** Set by `ensurePackagesBuilt` on the builds it spawns, since the intent has to cross a process boundary */
export const BUILD_INTENT_ENV = 'ABUDDY_BUILD_INTENT';

const intentFromEnv = (): BuildIntent => (process.env[BUILD_INTENT_ENV] === 'freshness' ? 'freshness' : 'command');

/**
 * Runs `run` holding the repo's package-build lock, so two builds never clear and rewrite the same
 * output at once. A lock whose process is gone is taken over. A live holder fails at once for a
 * `command` and is waited for by a `freshness` fix (see `BuildIntent`). Written then `link`ed, so a
 * reader never sees a half-written holder and mistakes it for an abandoned lock.
 */
export interface BuildLockOptions {
  readonly intent?: BuildIntent;
  /** How long a `freshness` fix waits. Injectable so a test can bound it: the default outlasts any suite. */
  readonly timeoutMs?: number;
}

export interface StampedBuildOptions extends BuildLockOptions {
  /** The lock to hold, for a test building a fixture against its own; the repo's by default */
  readonly lock?: string;
}

export async function withBuildLock<T>(label: string, run: () => T | Promise<T>, file = LOCK_FILE, options: BuildLockOptions = {}): Promise<T> {
  const intent = options.intent ?? intentFromEnv();
  const waitMs = options.timeoutMs ?? LOCK_WAIT_MS;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const pending = `${file}.${process.pid}`;
  fs.writeFileSync(pending, JSON.stringify({ pid: process.pid, label, startedAt: new Date().toISOString() }));
  try {
    const deadline = Date.now() + waitMs;
    // Counted separately from the loop: a `freshness` fix goes round it many times without taking anything
    // over, and taking over twice is what means the lock is not being released rather than merely held.
    for (let takeovers = 0; ; ) {
      try {
        fs.linkSync(pending, file);
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        const holder = readLock(file);
        const live = holder !== null && holderIsRunning(holder);
        if (live && intent === 'freshness' && Date.now() < deadline) {
          sleepSync(LOCK_POLL_MS);
          continue;
        }
        if (takeovers > 0 || holder === null || live) {
          const who = holder === null ? 'an unreadable lock file' : `pid ${holder.pid} (${holder.label}, started ${holder.startedAt})`;
          const waited = intent === 'freshness' ? ` after waiting ${Math.round(waitMs / 1000)}s` : '';
          throw new Error(`another package build holds ${path.relative(REPO_ROOT, file)}${waited}: ${who}. Wait for it to finish, then run this again.`);
        }
        takeovers++;
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
  options: StampedBuildOptions = {},
): Promise<void> {
  const { lock, ...lockOptions } = options;
  const intent = options.intent ?? intentFromEnv();
  await withBuildLock(label, async () => {
    // A `freshness` fix that waited for the lock asks again now it holds it: the build it waited for was
    // very likely building this same unit, and rebuilding what is already fresh is the duplicate work the
    // wait exists to avoid. A `command` builds regardless — it was asked for a build, not for freshness.
    if (intent === 'freshness' && unitStaleReason(unit, stamp) === null) return;
    await stampedRun(label, unit, stamp, build);
  }, lock, { ...lockOptions, intent });
}

/**
 * `run` between clearing the stamp and writing a new one, with no lock. The chain's steps stamp through
 * this: they are not package builds and must not queue behind the build lock, but the stamp they write has
 * to be the same protocol — one `STAMP_VERSION`, one `fingerprintUnit`, one thing to bump.
 *
 * The fingerprint is taken before `run` touches anything, so a source edited while it runs is recorded as
 * not done. The stamp is written only where `run` returned, so an interrupted step reads as never run.
 */
export async function stampedRun(label: string, unit: BuildUnit, stamp: string, run: () => void | Promise<void>): Promise<void> {
  const fingerprint = fingerprintUnit(unit);
  fs.rmSync(stamp, { force: true });
  await run();
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, `${JSON.stringify({ workspace: label, version: STAMP_VERSION, fingerprint, builtAt: new Date().toISOString() }, null, 2)}\n`);
}

/** Every `build:package` script wraps its work in this */
export async function runPackageBuild(workspace: string, build: () => void | Promise<void>): Promise<void> {
  const unit = BUILD_UNITS[workspace];
  if (!unit) throw new Error(`No build unit for ${workspace} in BUILD_UNITS (@abuddy/host/build/packages-built)`);
  await stampedBuild(workspace, unit, stampFile(workspace), build);
}

/**
 * Thrown where the caller set `ABUDDY_PACKAGES_PREBUILT=1` and a package went stale anyway: something
 * rebuilt or edited it while this run was reading it. `npm run chain` sets it for its parallel steps,
 * because the alternative is two of them rebuilding one `dist` at once.
 */
export class PackagesWentStale extends Error {
  constructor(readonly stale: readonly StaleUnit[]) {
    super(`the published packages went stale during a run that had already built them:\n${staleMessage(stale)}\n`
      + 'Something rebuilt or edited them while this process was reading them — `npm run packages:build` in a\n'
      + 'concurrent step is the usual cause. Nothing was rebuilt here, because that would race the writer.');
  }
}

/** Thrown when the build itself failed, so the caller doesn't report a check error as one */
export class PackagesBuildFailed extends Error {
  constructor(readonly status: number, readonly workspace?: string) {
    super(workspace ? `building ${workspace} failed` : 'npm run packages:build failed');
  }
}

/** Builds every publishable package when any of them is stale; a no-op when they are all up to date */
export function ensurePackagesBuilt(): void {
  // Another process may be building them right now — two test suites started together each run this as
  // their pretest. Wait for that build rather than reading the stamps it is rewriting and starting a
  // second one, which is a race that fails the reader with "no stamp".
  waitForPackageBuild();
  const stale = stalePackageUnits();
  if (stale.length === 0) return;
  // A caller that has already built them is asserting nothing will go stale under it, so staleness here
  // means the tree moved mid-run and whatever this process is about to read is half-written. Building it
  // would race the writer; saying so stops two processes fighting over one dist and reports the real
  // problem instead of the build error it turns into.
  if (process.env.ABUDDY_PACKAGES_PREBUILT === '1') {
    throw new PackagesWentStale(stale);
  }
  // Synchronous: a message written just before the process exits must not sit in a pipe's buffer
  fs.writeSync(2, `Published packages are out of date:\n${staleMessage(stale)}\nRebuilding ${stale.length} of ${Object.keys(BUILD_UNITS).length}\n`);
  // npm is a shell script on Windows, which execFile cannot spawn without one
  const windows = process.platform === 'win32';
  // One workspace at a time, not `packages:build`, which rebuilds all five whenever one is stale. The
  // units are independent: every build resolves the other packages under the source condition
  // (their tsconfigs' customConditions, bundle-package.ts's esbuild conditions), so none reads
  // another's dist and no order is implied. The workspace is named explicitly and the cwd is the repo,
  // so this runs the right script even as a workspace's own pretest.
  for (const { workspace } of stale) {
    try {
      // These builds are a freshness fix, not a command: another process may be building the same unit
      // right now, and the right answer is to wait for it and then find the work done.
      execFileSync(windows ? 'npm.cmd' : 'npm', ['run', 'build:package', '-w', workspace],
        { cwd: REPO_ROOT, stdio: 'inherit', shell: windows, env: { ...process.env, [BUILD_INTENT_ENV]: 'freshness' } });
    } catch (err) {
      const status = (err as { status?: number }).status;
      throw new PackagesBuildFailed(typeof status === 'number' && status !== 0 ? status : 1, workspace);
    }
  }
}
