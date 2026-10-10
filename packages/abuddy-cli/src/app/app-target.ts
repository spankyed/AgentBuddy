import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import envPaths from 'env-paths';
import semver from 'semver';
import { cachedBetaBuilds, ensureBetaApp, type PackagedApp } from './beta-app';
import { checkoutFor } from '../build/checkout-packages';

/** An app to launch a pack in: a built monorepo checkout, or a packaged app build. */
export type AppTarget =
  | { kind: 'source'; root: string }
  | { kind: 'packaged'; executable: string; version: string };

/** A kind of app, as a place that names one says it: a checkout at a path, or a Beta build. */
export type AppChoice = { source: string } | { beta: true };

export interface CliDirs {
  cache: string;
  /** Machine state the CLI owns and the app does not: today, the profiles `abuddy dev` creates */
  data: string;
}

export function cliDirs(): CliDirs {
  const paths = envPaths('abuddy-cli', { suffix: '' });
  return { cache: paths.cache, data: paths.data };
}

/** `~/AgentBuddy` → the home directory's AgentBuddy. */
export function expandHome(input: string): string {
  return input === '~' || input.startsWith('~/') ? path.join(os.homedir(), input.slice(1)) : input;
}

/** Missing pieces of a monorepo checkout needed to launch a pack in it; empty when usable. */
export function sourceAppProblems(root: string): string[] {
  const problems: string[] = [];
  if (!fs.existsSync(path.join(root, 'packages', 'entry-point.mjs'))) return ['not an AgentBuddy checkout (no packages/entry-point.mjs)'];
  if (!fs.existsSync(path.join(root, 'node_modules', 'electron'))) problems.push('node_modules/electron is missing (run npm install)');
  for (const pkg of ['main', 'renderer']) {
    if (!fs.existsSync(path.join(root, 'packages', pkg, 'dist'))) problems.push(`packages/${pkg}/dist is missing (run npm run build)`);
  }
  return problems;
}

function sourceTarget(root: string, from: string): AppTarget {
  const resolved = path.resolve(expandHome(root));
  const problems = sourceAppProblems(resolved);
  if (problems.length > 0) {
    throw new Error(`${from} (${resolved}) can't be used:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  }
  return { kind: 'source', root: resolved };
}

/** The app package inside a packaged build, which electron-builder ships unpacked (`asar: false`). */
function packagedAppDir(executable: string): string {
  return path.join(path.dirname(path.dirname(executable)), 'Resources', 'app');
}

/** Packaged apps ship each package's dist dir (electron-builder.mjs) next to the app code. */
export function packagedAppPackagesDir(executable: string): string {
  return path.join(packagedAppDir(executable), 'packages');
}

/** What a packaged build says its own version is, beside the packages dir above. */
function packagedAppVersion(executable: string): string | undefined {
  try {
    const { version } = JSON.parse(fs.readFileSync(path.join(packagedAppDir(executable), 'package.json'), 'utf-8'));
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `ABUDDY_BUILD`, the environment's form of `--build`, holding either shape.
 *
 * **One variable for one axis**, holding either shape — a build's name or a checkout's path — because
 * which of the two you hand it is not a different question. Read before anything can outrank it, so a
 * value that names nothing is refused wherever it sits rather than only where it won.
 *
 * **It is the *selector*, and `ABUDDY_ROOT`/`ABUDDY_APP_EXECUTABLE` are not.** Those two are how this CLI
 * hands a *resolved* answer to a child process — the fixture takes a checkout at a path or a packaged
 * executable — so they are two kinds of answer rather than two spellings of one question, and they stay.
 */
function buildFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const given = env.ABUDDY_BUILD;
  return given === undefined || given === '' ? undefined : given;
}

/** What every lookup here needs: where to look, and how to reach a beta when the answer is one. */
export interface AppLookupOptions {
  dirs?: CliDirs;
  env?: NodeJS.ProcessEnv;
  /** The pack's hostVersion, for choosing or downloading a beta */
  hostVersion?: string;
  /** Injected for tests; defaults to ensureBetaApp. */
  betaApp?: (hostVersion: string, cacheDir: string) => Promise<PackagedApp>;
}

export interface ConfiguredAppOptions extends AppLookupOptions {
  /** The pack whose checkout to look for, when nothing names an app. Absent means "do not derive" */
  from?: string;
  /** Injected for tests; defaults to `checkoutFor` */
  checkout?: (from: string) => string | undefined;
}

const betaAppFrom = (options: AppLookupOptions) =>
  options.betaApp ?? ((range: string, cacheDir: string) => ensureBetaApp({ hostVersion: range, cacheDir }));

/** A place an app can be named; `from` is what an error message and `announceApp` call it. */
interface NamedApp {
  choice: AppChoice;
  from: string;
}

/**
 * Where an app can be named, in precedence order — the one place that order is written. It used to be
 * written once per caller, and two of the three spelled the same rule differently: one ordered the
 * checks, the other kept beta out of the ABUDDY_ROOT branch with a negative guard.
 *
 * `saved` is the caller's policy rather than something this reads, so a pinned run passes nothing. That
 * argument is what "consults no machine state" looks like at the call site, where it used to be the
 * absence of a line.
 */
function namedApp(flags: AppFlags | undefined, env: NodeJS.ProcessEnv, saved?: NamedApp): NamedApp | undefined {
  // Read before anything can outrank it, so a typo'd value is refused wherever it sits. It used to be
  // short-circuited in the resolvers, which made `ABUDDY_BUILD=nightly` an error during `build` and
  // silence during `test` whenever --build won.
  const envBuild = buildFromEnv(env);
  if (flags?.build) return { choice: buildChoice(flags.build), from: `--build ${flags.build}` };
  if (envBuild) return { choice: buildChoice(envBuild), from: `ABUDDY_BUILD=${envBuild}` };
  return saved;
}

/**
 * The built-in packs directory of the app `abuddy build` resolves dependencies through: ABUDDY_BUILD=beta
 * (downloaded when needed), ABUDDY_ROOT, or the AgentBuddy checkout behind the pack. Lets a pack resolve
 * dependencies on built-in packs before the app has ever run, including in CI.
 *
 * **It derives the checkout where `resolveLaunchApp` does, and validates nothing where that one does.**
 * Both halves matter. The derivation is what retired the stored choice: this function used to read it,
 * on the argument that "pinning it would make every author's `build` download a beta, or set ABUDDY_ROOT
 * on each invocation, to reach the checkout they already named once" — true, and answered by finding the
 * checkout instead of remembering it. The validation is what must *not* be shared: a build reads the
 * checkout's `packages/`, so failing it for want of `main/dist` would refuse a tree that is perfectly
 * readable.
 *
 * **It never downloads a Beta it was not asked for.** Named beta, yes; derived, no — `null` lets
 * `fetch-deps` fall through to an installed app, the `.abuddy` cache and GitHub, which is cheaper and more
 * predictable than a build that quietly reaches the network.
 */
export async function configuredAppPackagesDir(options: ConfiguredAppOptions = {}): Promise<{ dir: string; label: string } | null> {
  const { dirs = cliDirs(), env = process.env, hostVersion = '*', from, checkout = checkoutFor } = options;
  const betaApp = betaAppFrom(options);
  const asPackages = (app: PackagedApp) =>
    ({ dir: packagedAppPackagesDir(app.executable), label: `AgentBuddy Beta ${app.version}` });

  const named = namedApp(undefined, env, undefined);
  if (!named) {
    const found = from === undefined ? undefined : checkout(from);
    if (found === undefined) return null;
    return { dir: path.join(found, 'packages'), label: `AgentBuddy checkout ${found}` };
  }

  if ('source' in named.choice) {
    // No `sourceAppProblems` here, and that is the point of the branch being its own: a build reads the
    // checkout's `packages/`, where launching it needs main/dist, renderer/dist and electron. Validating
    // would fail `abuddy build` on a checkout nobody has run `npm run build` in.
    const root = path.resolve(expandHome(named.choice.source));
    return { dir: path.join(root, 'packages'), label: `AgentBuddy checkout ${root}` };
  }

  // One rule, shared with `packagedTarget`: a downloaded build the range accepts wins, and the network is
  // for when none does. This split on `named.stored` until 2026-10-02 — a beta asked for on this run was
  // fetched, a remembered one answered from the cache — on the reading that naming beta means "the newest".
  // It doesn't: neither `build` nor `test` is an upgrade command, and a cached build that satisfies
  // `hostVersion` is a correct answer to "run against Beta". What the split cost was a GitHub round trip in
  // every explicit run, offline included. A newer beta is now an explicit act: remove the cached one.
  return asPackages(cachedBetaApp(dirs, hostVersion) ?? await betaApp(hostVersion, dirs.cache));
}

/**
 * The newest already-downloaded beta the pack's range accepts, or nothing. The range check is the half
 * this lacked: it took the newest cached build whatever the pack asked for, so a pack pinned to an older
 * host resolved its dependency types from a newer one, silently.
 *
 * **It matches on the app's own version, not the directory's name**, because those differ by design. A
 * beta promoted from a production release is tagged `v0.4.2-beta.0` on the released commit
 * (`build/release/beta-tag.sh`) while the app inside is `0.4.2`, and the cache directory is named after
 * the tag where `pickBetaRelease` matched the range against the app. Matching the directory name would
 * reject that build for every pack whose floor is a released version, on every build.
 *
 * It answers a `PackagedApp`, the same shape `ensureBetaApp` returns and for the same reason — `version` is
 * the tag the directory carries — so every caller asks one question and maps one answer.
 */
function cachedBetaApp(dirs: CliDirs, hostVersion: string): PackagedApp | null {
  for (const { tag, executable } of cachedBetaBuilds(dirs.cache)) {
    const version = packagedAppVersion(executable) ?? tag;
    // `includePrerelease` as pickBetaRelease passes it, and load-bearing rather than tidy: without it a
    // beta satisfies no range at all, `*` included — which is what a pack declaring no hostVersion gets,
    // so omitting it would empty the cache for most packs
    if (semver.satisfies(version, hostVersion, { includePrerelease: true })) return { version: tag, executable };
  }
  return null;
}

/**
 * The builds a name can select. Everything else a `--build` is given is a path.
 *
 * **One flag, because the two it replaced were never two concepts.** They split on the *shape of the
 * value* — a name or a path — and the name half accepted exactly one word, so the disambiguation is one
 * line: a value in this set is a build, anything else is a path. `./beta` says "the directory" the way it
 * does in every other tool, which is the escape hatch for the day a checkout is named after a channel.
 *
 * `build`, because it is the only word that covers all of them: "channel" does not, since `development` and
 * `test` are not releases. And it keeps one meaning across the CLI — `abuddy build` *produces* one,
 * `--build` *selects* one.
 */
export const BUILD_NAMES = ['beta'] as const;
export type BuildName = (typeof BUILD_NAMES)[number];

export const isBuildName = (value: string): value is BuildName => (BUILD_NAMES as readonly string[]).includes(value);

export interface AppFlags {
  /** A build by name, or a checkout by path. One flag, since the two were one axis all along */
  build?: string;
  /** Build the pack as a release before testing it, so the tests run what a release ships */
  release?: boolean;
  args: string[];
  /**
   * The pack is already built and must not be rebuilt. For a caller that built it in an earlier step — the
   * repo's `test:external-pack:contract` before its `:app` half — because a rebuild here destroys the
   * pack's `dist` for the length of the build, and anything else reading that tree meanwhile sees a pack
   * that is not built. The freshness the rebuild bought is checked instead, not dropped.
   */
  prebuilt?: boolean;
}

/**
 * Pulls `--build <name|path>` and `--release` out of the args forwarded to Playwright.
 *
 * `-d`, `-b` and `--production` are shorthands for `--build development`, `--build beta` and
 * `--build production`, on every command that has them: they keep working and change what they *mean*, a
 * build rather than an environment.
 */
export function parseAppFlags(argv: string[]): AppFlags {
  const flags: AppFlags = { args: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [name, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) : [arg];
    if (name === '--build') {
      const value = inline ?? argv[++i];
      if (!value) throw new Error('--build needs a value: a build name or a path to a checkout');
      flags.build = value;
    } else if (name === '--release') {
      flags.release = true;
    } else if (name === '--prebuilt') {
      flags.prebuilt = true;
    } else {
      flags.args.push(arg);
    }
  }
  return flags;
}

/**
 * What a `--build` value selects: a named build, or a checkout at that path.
 *
 * A bare value that is also a known name is the name; `./beta` is the path. Nothing else needs deciding —
 * with one reserved name it cannot be ambiguous today, and a value that is neither a name nor an existing
 * path is reported by whoever tries to use it, which says more than a parse error could.
 */
export const buildChoice = (value: string): AppChoice =>
  (isBuildName(value) ? { beta: true } : { source: value });

export interface ResolveAppOptions extends AppLookupOptions {
  flags: AppFlags;
  hostVersion: string;
}

/** What a derivation needs beyond a lookup: where the pack is, so a checkout can be found behind it */
export interface DeriveAppOptions extends ResolveAppOptions {
  /** The pack being worked on, or the directory a command was run from when there is no pack */
  from: string;
  /** Injected for tests; defaults to `checkoutFor` */
  checkout?: (from: string) => string | undefined;
}

/** The Beta build the pack's `hostVersion` asks for, downloaded if it isn't cached. */
async function packagedTarget(options: ResolveAppOptions): Promise<AppTarget> {
  const { hostVersion, dirs = cliDirs() } = options;
  // Cached first, which is what the sentence above has always said and what this did not do: it listed
  // releases every run and skipped only the download. See `configuredAppPackagesDir` for the one rule.
  const app = cachedBetaApp(dirs, hostVersion) ?? await betaAppFrom(options)(hostVersion, dirs.cache);
  return { kind: 'packaged', ...app };
}


/**
 * The app a run is *pinned* to: the flags, the environment, then the Beta build the pack's `hostVersion`
 * asks for. **It derives nothing and reads no machine state.**
 *
 * That separation is the point. `resolveTestApp` used to fall through to `~/.config/abuddy-cli/config.json`
 * and, in a terminal, to a question whose answer it then persisted — so a pack's test result depended on
 * what someone typed once on that machine, and two authors on one commit could be testing different app
 * builds. The data layer was never the problem: the fixture always takes a fresh `mkdtemp` and forces
 * `env: 'test'`, which is why this hid for so long — the isolation people check for is real, one layer
 * below where the leak was.
 *
 * Removing the config read leaves no hole, because the pinned answer already existed: `--build beta`
 * computes it from the manifest. The stored choice was shadowing a correct default, not supplying a
 * missing one — and it is gone now, so what this still refuses is the *derivation*: a pinned run must not
 * depend on which directory the pack happens to sit in either.
 *
 * `resolveDevelopmentApp` below is the other half, for the commands whose job *is* to hold a preference.
 */
/**
 * What a command is running against, as one sentence fragment.
 *
 * One rendering, because three commands describing the same app differently is how a reader stops trusting
 * the line — and the line is the whole point of `announceApp`.
 */
export function appLabel(app: AppTarget): string {
  return app.kind === 'source' ? `AgentBuddy from ${app.root}` : `AgentBuddy Beta ${app.version}`;
}

/**
 * Says which app was resolved and **where the answer came from**, on stderr.
 *
 * The provenance is the half that matters. Every source on the ladder but one was asked for on *this* run
 * — a flag, an environment variable — so the reader already knows about it. The **derived** answer is the
 * exception: nothing in the request mentions it, and being derived is exactly what makes it worth stating,
 * since a reader who disagrees with it needs to know which of the two rules fired before they can say so.
 * A derivation nobody can see is a preference by another name.
 *
 * **stderr, not stdout**, because it describes the run rather than being its output: `abuddy drive --eval`
 * prints one JSON envelope on stdout and a program reads it. `abuddy db` prints its target the same way
 * for the same reason.
 */
function announceApp(app: AppTarget, from: string): void {
  console.error(`Using ${appLabel(app)} (${from})`);
}

export async function resolvePinnedApp(options: ResolveAppOptions): Promise<AppTarget> {
  const { flags, env = process.env } = options;

  const named = namedApp(flags, env, undefined);
  if (named && 'source' in named.choice) return sourceTarget(named.choice.source, named.from);
  // The default, not just the `--build beta` case: a pinned run always has an answer, from the manifest
  return packagedTarget(options);
}

/**
 * **Which app, derived rather than remembered.** Named on this run wins; else the AgentBuddy checkout
 * behind the pack; else the newest Beta the pack's `hostVersion` accepts.
 *
 * This replaced a question asked once and stored in the user's config dir, which was wrong three ways: one
 * slot answered for every pack on the machine, so two packs with different `hostVersion` ranges shared an
 * app; a stale answer went on winning silently for as long as the file existed; and the prompt was the
 * worst thing to put in a CLI an agent drives, because it does not fail, it hangs.
 *
 * **The checkout rule is the correct pairing, not a convenience.** If a pack's `@abuddy/*` resolve into a
 * checkout — or the pack simply sits inside one, which `checkoutFor` also answers — then the pack is
 * compiled against that checkout's packages. Launching it inside a released Beta pairs a source-built pack
 * with a released host, which is a mismatch to report rather than a preference to hold.
 *
 * **`checkoutFor` says a checkout is there, never that it can be launched.** That is `sourceTarget`'s job
 * here (`electron`, `main/dist`, `renderer/dist`), and an unbuilt one fails naming `npm run build` rather
 * than quietly falling through to a Beta — falling through is how you end up with the mismatch above and
 * only a warning between you and a confusing runtime failure. `configuredAppPackagesDir` deliberately does
 * *not* validate, because a build reads `packages/` and launches nothing.
 */
export async function deriveApp(options: DeriveAppOptions): Promise<NamedApp & { target: AppTarget }> {
  const { flags, env = process.env, from, checkout = checkoutFor } = options;
  const named = namedApp(flags, env, undefined);
  if (named) {
    const target = 'source' in named.choice ? sourceTarget(named.choice.source, named.from) : await packagedTarget(options);
    return { ...named, target };
  }
  const found = checkout(from);
  if (found !== undefined) {
    return { choice: { source: found }, from: 'the checkout this pack is built against', target: sourceTarget(found, 'The AgentBuddy checkout behind this pack') };
  }
  return { choice: { beta: true }, from: `hostVersion ${options.hostVersion}`, target: await packagedTarget(options) };
}

/** The app a command **launches**, derived and validated, and stated so the derivation is never silent. */
export async function resolveLaunchApp(options: DeriveAppOptions): Promise<AppTarget> {
  const { target, from } = await deriveApp(options);
  announceApp(target, from);
  return target;
}
