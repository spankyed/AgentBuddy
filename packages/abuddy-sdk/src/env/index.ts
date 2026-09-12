/**
 * App environment resolution — the only place that decides which environment a process
 * belongs to and where its data lives.
 *
 * The Electron main process infers the environment once (inferElectronAppEnv) and hands
 * ABUDDY_ENV + ABUDDY_USER_DATA_DIR to everything it spawns. Every other process either
 * receives those or passes { env } explicitly (CLI commands). Nothing falls back to
 * production: an unknown environment is an error, not a guess.
 */
import * as os from 'node:os';
import * as path from 'node:path';

export type AppEnv = 'production' | 'beta' | 'development' | 'test';

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
  registryFile: string;
  apiPortFile: string;
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
    registryFile: path.join(userDataDir, 'pack-registry.json'),
    apiPortFile: path.join(userDataDir, 'api-port'),
    urlScheme: env === 'beta' ? 'abuddy-beta' : 'abuddy',
  };
}

/**
 * The Electron main process's inference, kept pure for testing:
 * 1. Playwright → test
 * 2. Packaged → the channel stamped at build time (a missing stamp is a broken build)
 * 3. Unpackaged → ABUDDY_ENV if set, otherwise development
 */
export function inferElectronAppEnv(input: {
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
