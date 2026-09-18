/**
 * App environment resolution — the only place that decides which environment a process
 * belongs to and where its data lives.
 *
 * The Electron main process infers the environment once (_inferElectronAppEnv) and hands
 * ABUDDY_ENV + ABUDDY_USER_DATA_DIR to everything it spawns. Every other process either
 * receives those or passes { env } explicitly (CLI commands). Nothing falls back to
 * production: an unknown environment is an error, not a guess.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { boundHost } from '../runtime/host-runtime.ts';

export type AppEnv = 'production' | 'beta' | 'development' | 'test';

/** What a running API publishes about itself in `AppContext.apiPortFile`, so local tools find it */
export interface ApiEndpoint {
  port: number;
  /** The API process. A file whose process is gone is one a crash left behind, not a running app */
  pid: number;
}

/**
 * The API running on this data dir, from the file it published, or `null` when there is none: no file, one that
 * can't be read, or one a crashed run left behind, whose process has exited. A process this user may not signal
 * counts as running. Whether the API answers is the caller's to check.
 */
export function readApiEndpoint(apiPortFile: string): ApiEndpoint | null {
  let published: { port?: unknown; pid?: unknown };
  try {
    published = JSON.parse(fs.readFileSync(apiPortFile, 'utf-8')) as { port?: unknown; pid?: unknown };
  } catch {
    return null;
  }
  const { port, pid } = published;
  if (!Number.isInteger(port) || (port as number) <= 0 || (port as number) > 65535) return null;
  if (!Number.isInteger(pid) || (pid as number) <= 0) return null;
  try {
    process.kill(pid as number, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null;
  }
  return { port: port as number, pid: pid as number };
}

export const APP_ENVS: readonly AppEnv[] = ['production', 'beta', 'development', 'test'];

/** Channels a packaged build can be stamped with (build/build.sh → __ABUDDY_CHANNEL__). */
export type ReleaseChannel = Extract<AppEnv, 'production' | 'beta'>;

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
  userDataDir: string;
  packsDir: string;
  /** Build-time artifacts (types/, build/) of the app's built-in packs, for pack authors' dependency resolution. */
  hostPacksDir: string;
  registryFile: string;
  /** Where a running API publishes its port and process id (`readApiEndpoint`), so local tools find it */
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
  return {
    env,
    appName,
    userDataDir,
    packsDir: path.join(userDataDir, 'packs'),
    hostPacksDir: path.join(userDataDir, 'host-packs'),
    registryFile: path.join(userDataDir, 'pack-registry.json'),
    apiPortFile: path.join(userDataDir, 'api-port'),
    apiTokenFile: path.join(userDataDir, 'api-token'),
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
