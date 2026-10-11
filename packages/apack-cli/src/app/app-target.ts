import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import envPaths from 'env-paths';
import semver from 'semver';
import { parseAppEnv, type AppEnv } from '@apackdev/sdk/env';
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
  /** Machine state the CLI owns and the app does not: today, the profiles `apack dev open` creates */
  data: string;
}

export function cliDirs(): CliDirs {
  const paths = envPaths('apack-cli', { suffix: '' });
  return { cache: paths.cache, data: paths.data };
}

/** `~/apack` → the home directory's apack. */
export function expandHome(input: string): string {
  return input === '~' || input.startsWith('~/') ? path.join(os.homedir(), input.slice(1)) : input;
}

/** Missing pieces of a monorepo checkout needed to launch a pack in it; empty when usable. */
export function sourceAppProblems(root: string): string[] {
  const problems: string[] = [];
  if (!fs.existsSync(path.join(root, 'packages', 'entry-point.mjs'))) return ['not an apack checkout (no packages/entry-point.mjs)'];
  if (!fs.existsSync(path.join(root, 'node_modules', 'electron'))) problems.push('node_modules/electron is missing (run npm install)');
  for (const pkg of ['main', 'renderer']) {
    if (!fs.existsSync(path.join(root, 'packages', pkg, 'dist'))) problems.push(`packages/${pkg}/dist is missing (run npm run build:default-setup && npm run build:runtime)`);
  }
  return problems;
}

export function sourceTarget(root: string, from: string): AppTarget {
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

/** Reads the packaged app's authoritative channel; release tags and executable names can differ. */
export function packagedAppEnv(executable: string): AppEnv {
  const manifest = path.join(packagedAppDir(executable), 'build-manifest.json');
  const build = parseAppEnv(JSON.parse(fs.readFileSync(manifest, 'utf-8')).channel);
  if (build !== 'production' && build !== 'beta' && build !== 'preview') throw new Error(`Invalid packaged channel in ${manifest}`);
  return build;
}

/** Select an explicit .app bundle, or a built source checkout. */
function pathTarget(input: string, from: string): AppTarget {
  const root = path.resolve(expandHome(input));
  if (!root.endsWith('.app')) return sourceTarget(root, from);
  const resources = path.join(root, 'Contents', 'Resources', 'app');
  const metadata = JSON.parse(fs.readFileSync(path.join(resources, 'build-manifest.json'), 'utf-8'));
  const executable = path.join(root, 'Contents', 'MacOS', metadata.productName);
  packagedAppEnv(executable);
  fs.accessSync(executable, fs.constants.X_OK);
  return { kind: 'packaged', executable, version: metadata.version };
}

/** App development never falls back to a downloaded release. */
export function resolveDevApp(flags: AppFlags, from: string, env: NodeJS.ProcessEnv = process.env): AppTarget {
  const named = namedApp(flags, env);
  if (named && 'beta' in named.choice) throw new Error('apack dev requires a source checkout; release channels are not attachable.');
  const root = named && 'source' in named.choice ? named.choice.source : checkoutFor(from);
  if (!root) throw new Error('No apack checkout found. Use --app <checkout> or run inside the app repository.');
  const app = pathTarget(root, named?.from ?? 'the current checkout');
  if (app.kind !== 'source') throw new Error('apack dev requires a source checkout; packaged apps are not attachable.');
  announceApp(app, named?.from ?? 'the current checkout');
  return app;
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

function namedApp(flags: AppFlags | undefined, env: NodeJS.ProcessEnv): NamedApp | undefined {
  if (env.APACK_APP && env.APACK_CHANNEL) throw new Error('Use APACK_APP or APACK_CHANNEL, not both.');
  if (env.APACK_CHANNEL && env.APACK_CHANNEL !== 'beta') throw new Error('APACK_CHANNEL must be beta for downloaded authoring hosts.');
  if (flags?.app && flags.channel) throw new Error('Choose one --app or --channel.');
  if (flags?.app) return { choice: { source: flags.app }, from: `--app ${flags.app}` };
  if (flags?.channel) return { choice: { beta: true }, from: '--channel beta' };
  if (env.APACK_APP) return { choice: { source: path.resolve(expandHome(env.APACK_APP)) }, from: `APACK_APP=${env.APACK_APP}` };
  if (env.APACK_CHANNEL) return { choice: { beta: true }, from: 'APACK_CHANNEL=beta' };
  return undefined;
}

export async function configuredAppPackagesDir(options: ConfiguredAppOptions = {}): Promise<{ dir: string; label: string } | null> {
  const { dirs = cliDirs(), env = process.env, hostVersion = '*', from, checkout = checkoutFor } = options;
  const betaApp = betaAppFrom(options);
  const asPackages = (app: PackagedApp) =>
    ({ dir: packagedAppPackagesDir(app.executable), label: `apack Beta ${app.version}` });

  const named = namedApp(undefined, env);
  if (!named) {
    const found = from === undefined ? undefined : checkout(from);
    if (found === undefined) return null;
    return { dir: path.join(found, 'packages'), label: `apack checkout ${found}` };
  }

  if ('source' in named.choice) {
    // No `sourceAppProblems` here, and that is the point of the branch being its own: a build reads the
    // checkout's `packages/`, where launching it needs main/dist, renderer/dist and electron. Validating
    // would fail `apack pack build` on a checkout nobody has run `npm run build:default-setup && npm run build:runtime` in.
    const root = path.resolve(expandHome(named.choice.source));
    return root.endsWith('.app')
      ? { dir: path.join(root, 'Contents', 'Resources', 'app', 'packages'), label: `apack bundle ${root}` }
      : { dir: path.join(root, 'packages'), label: `apack checkout ${root}` };
  }

  // One rule, shared with `packagedTarget`: a downloaded build the range accepts wins, and the network is
  // for when none does. This split on `named.stored` until 2026-10-02 — a beta asked for on this run was
  // fetched, a remembered one answered from the cache — on the reading that naming beta means "the newest".
  // It doesn't: neither `build` nor `test` is an upgrade command, and a cached build that satisfies
  // `hostVersion` is a correct answer to "run against Beta". What the split cost was a GitHub round trip in
  // every explicit run, offline included. A newer beta is now an explicit act: remove the cached one.
  return asPackages(cachedBetaApp(dirs, hostVersion) ?? await betaApp(hostVersion, dirs.cache));
}

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

export interface AppFlags {
  /** Explicit checkout or .app bundle path. */
  app?: string;
  /** Downloaded pack authoring host channel. */
  channel?: 'beta';
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

/** Parse executable selection separately from release channels and pack build options. */
export function parseAppFlags(argv: string[]): AppFlags {
  const flags: AppFlags = { args: [] };
  let selected = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [name, inline] = arg.split(/=(.*)/s, 2);
    if (name === '--app' || name === '--channel') {
      if (selected) throw new Error('Choose one --app or --channel.');
      const value = inline ?? argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
      if (name === '--channel' && value !== 'beta') throw new Error('Only --channel beta supplies a downloaded pack authoring host.');
      if (name === '--app') flags.app = path.resolve(expandHome(value));
      else flags.channel = 'beta';
      selected = true;
    } else if (name === '--release') flags.release = true;
    else if (name === '--prebuilt') flags.prebuilt = true;
    else flags.args.push(arg);
  }
  return flags;
}

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
 * What a command is running against, as one sentence fragment.
 *
 * One rendering, because three commands describing the same app differently is how a reader stops trusting
 * the line — and the line is the whole point of `announceApp`.
 */
export function appLabel(app: AppTarget): string {
  return app.kind === 'source' ? `apack from ${app.root}` : `apack ${packagedAppEnv(app.executable)} ${app.version}`;
}

function announceApp(app: AppTarget, from: string): void {
  console.error(`Using ${appLabel(app)} (${from})`);
}

export async function resolvePinnedApp(options: ResolveAppOptions): Promise<AppTarget> {
  const { flags, env = process.env } = options;

  const named = namedApp(flags, env);
  if (named && 'source' in named.choice) return pathTarget(named.choice.source, named.from);
  // The default, not just the `--channel beta` case: a pinned run always has an answer, from the manifest
  return packagedTarget(options);
}

export async function deriveApp(options: DeriveAppOptions): Promise<NamedApp & { target: AppTarget }> {
  const { flags, env = process.env, from, checkout = checkoutFor } = options;
  const named = namedApp(flags, env);
  if (named) {
    const target = 'source' in named.choice ? pathTarget(named.choice.source, named.from) : await packagedTarget(options);
    return { ...named, target };
  }
  const found = checkout(from);
  if (found !== undefined) {
    return { choice: { source: found }, from: 'the checkout this pack is built against', target: sourceTarget(found, 'The apack checkout behind this pack') };
  }
  return { choice: { beta: true }, from: `hostVersion ${options.hostVersion}`, target: await packagedTarget(options) };
}

/** The app a command **launches**, derived and validated, and stated so the derivation is never silent. */
export async function resolveLaunchApp(options: DeriveAppOptions): Promise<AppTarget> {
  const { target, from } = await deriveApp(options);
  announceApp(target, from);
  return target;
}
