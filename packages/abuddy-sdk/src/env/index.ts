/**
 * App environment resolution — the only place that decides which environment a process
 * belongs to and where its data lives.
 *
 * The Electron main process infers the environment once (_inferElectronAppEnv) and hands
 * ABUDDY_ENV + ABUDDY_USER_DATA_DIR to everything it spawns. Every other process either
 * receives those or passes { env } explicitly (CLI commands). Nothing falls back to
 * production: an unknown environment is an error, not a guess.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { boundHost } from '../runtime/host-runtime.ts';

/**
 * The environments, and the type of one.
 *
 * The list is the declaration and the union is derived from it, rather than the two being written side by side:
 * `APP_ENVS: readonly AppEnv[]` accepted a list missing a member, and the one thing that reads it is the guard
 * below — so an environment left out of the array would be rejected at startup as invalid.
 */
export const APP_ENVS = ['production', 'beta', 'development', 'test'] as const;

export type AppEnv = (typeof APP_ENVS)[number];

/** Channels a packaged build can be stamped with (build/build.sh → __ABUDDY_CHANNEL__). */
export type ReleaseChannel = Extract<AppEnv, 'production' | 'beta'>;

/** The app's own directory inside Electron's `userData`. See `AppContext.appDir`. */
const APP_DIR = 'abuddy';

const APP_NAMES: Record<AppEnv, string> = {
  production: 'abuddy',
  beta: 'abuddy-beta',
  development: 'abuddy-dev',
  test: 'abuddy-test',
};

export interface AppContext {
  env: AppEnv;
  /** Electron app name; also the default data dir name. */
  appName: string;
  /**
   * Electron's `userData` directory. Chromium owns its root — `Cache/`, `Preferences`, `Partitions/` and a
   * dozen more names that change with Electron — so nothing of the app's is written directly in it.
   */
  userDataDir: string;
  /**
   * Everything the app owns, inside `userDataDir`. One directory per stack: the database, the run history,
   * installed packs, their build output, secrets, logs and locks, and each pack's own data under
   * `pack-data/<packId>/`.
   *
   * It exists because the data dir stopped being just a database. Sharing a flat namespace with Chromium
   * meant a pack asking for `getDataDirPath('Cache')` could shadow Chromium's, and an app that writes
   * sixteen names into someone else's directory cannot say which files are its own — which is what a
   * backup, an instance and `abuddy db` all need to know.
   */
  appDir: string;
  packsDir: string;
  /** Build-time artifacts (types/, build/) of the app's built-in packs, for pack authors' dependency resolution. */
  installedPacksFile: string;
  /** Where a running API publishes its port and process id, so local tools find it (`@abuddy/host/process-liveness`) */
  apiPortFile: string;
  /** A development app's API token, for local tools calling its API (written by the API, readable only by the user) */
  apiTokenFile: string;
  urlScheme: string;
}

export function parseAppEnv(value: string | undefined): AppEnv | undefined {
  if (value === undefined || value === '') return undefined;
  if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
  throw new Error(`Invalid app environment "${value}". Expected one of: ${APP_ENVS.join(', ')}`);
}

function platformDataDir(appName: string): string {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', appName);
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
    default:
      return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), appName);
  }
}

/**
 * Resolve environment and data paths. Explicit input wins, then ABUDDY_ENV /
 * ABUDDY_USER_DATA_DIR. Throws when the environment can't be determined.
 */
/**
 * Where an environment's app keeps its data on this machine, whatever `ABUDDY_USER_DATA_DIR` says: the dir a tool
 * means when it names an app (`abuddy db -d`), rather than the one a shell happens to point at.
 */
export function appDataDirFor(env: AppEnv): string {
  return platformDataDir(APP_NAMES[env]);
}

/**
 * The one directory the app owns inside a data dir. Taken as a function as well as an `AppContext` member
 * because host code is often handed a data dir rather than a context — a lock file, a dev-server marker.
 *
 * @internal Host-only: a pack reaches its own directory through `getDataDirPath` (`#generated/paths`).
 */
export const _appDirOf = (userDataDir: string): string => path.join(userDataDir, APP_DIR);

export function resolveAppContext(input: { env?: AppEnv; userDataDir?: string } = {}): AppContext {
  const env = input.env ?? parseAppEnv(process.env.ABUDDY_ENV);
  if (!env) {
    throw new Error(
      'App environment unknown: pass { env } or set ABUDDY_ENV (production | beta | development | test). ' +
      'Processes spawned by the app receive it automatically.',
    );
  }
  const appName = APP_NAMES[env];
  const userDataDir = input.userDataDir ?? (process.env.ABUDDY_USER_DATA_DIR || platformDataDir(appName));
  const appDir = _appDirOf(userDataDir);
  return {
    env,
    appName,
    userDataDir,
    appDir,
    packsDir: path.join(appDir, 'packs'),
    installedPacksFile: path.join(appDir, 'installed-packs.json'),
    apiPortFile: path.join(appDir, 'api-port'),
    apiTokenFile: path.join(appDir, 'api-token'),
    urlScheme: env === 'beta' ? 'abuddy-beta' : 'abuddy',
  };
}

/**
 * The Electron main process's inference, kept pure for testing:
 * 1. Playwright → test
 * 2. Packaged → the channel stamped at build time (a missing stamp is a broken build)
 * 3. Unpackaged → ABUDDY_ENV if set, otherwise development
 *
 * @internal Host-only: the Electron main process infers its environment.
 */
export function _inferElectronAppEnv(input: {
  playwrightTest: boolean;
  isPackaged: boolean;
  channel: string;
  envVar: string | undefined;
}): AppEnv {
  if (input.playwrightTest) return 'test';

  if (input.isPackaged) {
    if (input.channel !== 'production' && input.channel !== 'beta') {
      throw new Error(
        `Packaged build has no valid release channel stamp (got "${input.channel}"). ` +
        'Build with build/build.sh, which exports ABUDDY_ENV=production|beta.',
      );
    }
    return input.channel;
  }

  return parseAppEnv(input.envVar) ?? 'development';
}

/** The running app's version (the test host's is `0.0.0-test`); throws, naming bindHost, when no app is bound */
export function getAppVersion(): string {
  return boundHost().appVersion;
}
