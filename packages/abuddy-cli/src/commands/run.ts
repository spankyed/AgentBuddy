import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from './build';
import { findPackRoot, readManifest } from '../utils';
import { findFEEntry, packDevServerConfig } from '../build/fe-bundler';
import { cliDirs, parseAppFlags, resolveDevelopmentApp, type AppTarget } from '../app/app-target';
import { instanceFor, parseInstanceFlags, removeInstance, INSTANCE_USAGE } from '../app/instances';
import { copySecretsInto } from '../app/instance-secrets.ts';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { AppEnv } from '@abuddy/sdk/env';
import { readApiEndpoint } from '@abuddy/host/process-liveness';
import { withoutSourceCondition } from '@abuddy/host/build/source-resolution';
import { API_HOST, API_TOKEN_HEADER, errorMessage } from '@abuddy/sdk/utils/pure';
import { installPackFromLocal, readHostInfo } from '@abuddy/host/packs';
import { removeDevServerMarker, writeDevServerMarker } from '@abuddy/host/packs/dev-server';

const HELP = `
Usage: abuddy run [--app-root <path> | --app beta]

Launch AgentBuddy with this pack installed, and keep it in step with your edits: FE changes
reload the window through Vite, BE changes rebuild, reinstall and reload in place.

An app already running on the same data dir is used as it is; otherwise one is launched, and
closing this command closes the app it started.

Options:
  --app-root <path>   a local AgentBuddy checkout (installed and built)
  --app beta          the newest AgentBuddy Beta build that satisfies the pack's hostVersion
${INSTANCE_USAGE}
  --help, -h          Show this help

With no app named, the one saved on first run is used, and you are asked once if there is none.
With no instance named, the shared development data dir is used, as before.

Note that --app beta reloads by restarting rather than in place: a packaged build refuses a
pack reload, and publishes no API token for one.
`.trim();

const reason = (err: unknown) => (errorMessage(err));

/**
 * Which environment an app target runs as. A packaged build stamps its own channel at build time
 * (`_inferElectronAppEnv`), so this reports what the app will decide rather than deciding it: passing
 * ABUDDY_ENV to a beta binary would change nothing.
 */
export function appEnv(app: AppTarget): AppEnv {
  return app.kind === 'source' ? 'development' : 'beta';
}

/**
 * Where an app runs: its environment, and its data dir when an instance overrides the default. Leaving
 * `userDataDir` out is not the same as naming the default one — it lets `ABUDDY_USER_DATA_DIR` from the
 * caller's shell still apply, which is an escape hatch that predates instances.
 */
export interface AppPlace {
  env: AppEnv;
  userDataDir?: string;
}

/** The running app's API: its URL and the token it requires, from the files the API writes */
function findAppApi(place: AppPlace): { api: { url: string; token: string } } | { problem: string } {
  const { apiPortFile, apiTokenFile } = resolveAppContext(place);
  const endpoint = readApiEndpoint(apiPortFile);
  if (!endpoint) return { problem: `no running ${place.env} app in ${apiPortFile}` };
  let token: string;
  try {
    token = fs.readFileSync(apiTokenFile, 'utf-8').trim();
  } catch (err) {
    return { problem: `couldn't read ${apiTokenFile}: ${reason(err)}` };
  }
  if (!token) return { problem: `${apiTokenFile} is empty` };
  return { api: { url: `http://${API_HOST}:${endpoint.port}`, token } };
}

/**
 * What a reload came to. `detail` says which of the several ways it went wrong this was, since they need
 * different things of the author: start the app, look at its logs, or check what is holding the port.
 */
export type DevReload =
  | { status: 'reloaded' }
  /** No port or token file to reach an app with */
  | { status: 'not-running'; detail: string }
  /** The app answered and refused, or couldn't reload */
  | { status: 'failed'; detail: string }
  /** Nothing answered on the port the app published */
  | { status: 'unreachable'; detail: string };

/** Asks the running app to reload a pack's runtime, with its API token. */
export async function reloadPack(packId: string, place: AppPlace = { env: 'development' }): Promise<DevReload> {
  const found = findAppApi(place);
  if ('problem' in found) return { status: 'not-running', detail: found.problem };
  try {
    const res = await fetch(`${found.api.url}/dev/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: found.api.token },
      body: JSON.stringify({ packId }),
    });
    if (res.ok) return { status: 'reloaded' };
    const body = await res.text().catch(() => '');
    return { status: 'failed', detail: `${res.status} ${res.statusText}${body.trim() ? `: ${body.trim()}` : ''}` };
  } catch (err) {
    return { status: 'unreachable', detail: `${found.api.url}: ${reason(err)}` };
  }
}

/** Prints what a reload came to; `what` names the changes (`BE changes`, `changes`) */
function reportReload(result: DevReload, what: string): void {
  if (result.status === 'reloaded') console.log('BE reloaded successfully.\n');
  else if (result.status === 'not-running') console.warn(`The app is not running (${result.detail}). Restart to apply ${what}.\n`);
  else if (result.status === 'failed') console.warn(`The app refused the reload (${result.detail}). Restart the app to apply ${what}.\n`);
  else console.warn(`Could not reach the app (${result.detail}). Restart to apply ${what}.\n`);
}

/** Installs into the app's data dir, checking hostVersion and the build format against the app that last used it. */
export function installToApp(root: string, place: AppPlace = { env: 'development' }) {
  const { packsDir, userDataDir } = resolveAppContext(place);
  const { version: hostVersion, packFormat } = readHostInfo(userDataDir);
  return installPackFromLocal(root, packsDir, { hostVersion, packFormat });
}

/**
 * The app's environment, minus this process's own. Two things have to go: ELECTRON_RUN_AS_NODE, which the
 * app-bundled `abuddy` sets and which would start Electron as plain Node, and the `@abuddy/source`
 * condition, since a checkout's app declares its own and a packaged one must not resolve source at all.
 */
function appLaunchEnv(place: AppPlace): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') out[key] = value;
  }
  const nodeOptions = withoutSourceCondition(out.NODE_OPTIONS);
  if (nodeOptions) out.NODE_OPTIONS = nodeOptions;
  else delete out.NODE_OPTIONS;
  // Only a source run reads this; a packaged build stamps its channel (see `appEnv`)
  out.ABUDDY_ENV = place.env;
  if (place.userDataDir !== undefined) {
    // Set only for an instance, and deliberately: it is also what tells Electron the run was pointed at
    // its own dir, which moves the logs inside it (`main/src/app-context.ts`). A plain `abuddy run` should
    // keep writing to the platform log dir, and should keep honouring an ABUDDY_USER_DATA_DIR the caller
    // exported, which naming one here would override.
    out.ABUDDY_USER_DATA_DIR = place.userDataDir;
    // An instance holds its own keys, so the data key goes beside them rather than into the OS keychain,
    // where every instance of one channel would share a service name. The app reads this in any
    // environment but production.
    out.ABUDDY_SECRETS_VAULT = 'file';
  }
  return out;
}

/** Starts the app. A checkout runs its own sources with its own electron, so a pack needs none installed. */
function launchApp(app: AppTarget, place: AppPlace): ChildProcess {
  const options = { env: appLaunchEnv(place), stdio: 'ignore' as const, detached: false };
  if (app.kind === 'source') {
    const electron = createRequire(path.join(app.root, 'package.json'))('electron') as string;
    return spawn(electron, [app.root], { ...options, cwd: app.root });
  }
  return spawn(app.executable, [], options);
}

/** Resolves once the child is gone, killing it outright if it will not go. */
function exited(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Waits for the app to publish its port file, which is what says the API is up and so what says the pack
 * can be installed and reloaded. One waiter, bounded: a crashed launch must report that rather than hang.
 */
async function waitForApi(apiPortFile: string, child: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readApiEndpoint(apiPortFile)) return;
    if (child.exitCode !== null) throw new Error(`The app exited (${child.exitCode}) before its API came up`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`The app did not publish ${apiPortFile} within ${timeoutMs / 1000}s`);
}

/** What a session hands back so `run` can tear it down on the way out of a throw. */
interface SessionHooks {
  teardown?: () => Promise<void>;
}

export async function run(args: string[]) {
  const hooks: SessionHooks = {};
  try {
    await session(args, hooks);
  } catch (error) {
    // The signals have their own handlers; this is every other way a session ends, and it is the one
    // that happens while developing — a pack that fails to build used to exit through the CLI's error
    // handler and leave an ephemeral instance behind
    await hooks.teardown?.();
    throw error;
  }
}

async function session(args: string[], hooks: SessionHooks) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const root = findPackRoot(process.cwd());
  const srcDir = path.join(root, 'src');

  if (!fs.existsSync(srcDir)) {
    throw new Error('No src/ directory to watch');
  }

  const manifest = readManifest(root);
  const feEntry = findFEEntry(root);

  const { mode, withSecrets, rest } = parseInstanceFlags(args);
  const flags = parseAppFlags(rest);
  // `run` forwards nothing, so a leftover flag is a typo rather than an argument for something else —
  // where `drive` hands its own leftovers to Playwright and must not refuse them. Ignoring one silently
  // is how a removed or misspelled flag reads as having been obeyed.
  const unknown = flags.args.filter(arg => arg.startsWith('-'));
  if (unknown.length > 0) {
    throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. See abuddy run --help.`);
  }
  const app = await resolveDevelopmentApp({ flags, hostVersion: manifest.hostVersion ?? '*' });
  const env = appEnv(app);
  const instance = instanceFor(mode, cliDirs());
  if (instance?.created && withSecrets) {
    const { count, from } = copySecretsInto(instance, env);
    console.log(`Copied ${count} secret${count === 1 ? '' : 's'} from ${from}`);
  }
  const place: AppPlace = { env, userDataDir: instance?.dir };
  const { userDataDir, apiPortFile } = resolveAppContext(place);

  // Registered here rather than once the dev server is up, because the ten seconds before that — the
  // build, the launch, the install — are exactly when someone presses Ctrl-C, and an ephemeral instance
  // interrupted there used to be left on disk. `child` and `server` are filled in as they come.
  let child: ChildProcess | undefined;
  let server: { close: () => unknown } | undefined;
  let markerFor: string | undefined;

  // One-shot: `teardown` calls this and then exits, which fires the `exit` handler and would otherwise
  // close the Vite server and remove the marker a second time
  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (markerFor !== undefined) removeDevServerMarker(userDataDir, markerFor);
    server?.close();
    // Only one this command launched: an app that was already up outlives it
    child?.kill();
  }

  /**
   * Everything the `exit` handler cannot do, because that one has to be synchronous: removing an
   * ephemeral instance while the app is still closing pulls LMDB's files and the app's own log dir out
   * from under it — noisy on macOS, and on Windows an EBUSY that leaves the directory half removed. So
   * let the app go first.
   *
   * **Every way this command ends runs it**, which is the part that took two goes to get right. Wiring it
   * to the signals alone left the case that actually happens while developing — a pack that fails to
   * build — exiting through the CLI's own error handler and leaking the directory. A SIGKILL still
   * leaks one, which is why an ephemeral dir carries the pid that made it and
   * `abuddy instances rm --leaked` can reclaim it.
   */
  let tornDown = false;
  async function teardown(): Promise<void> {
    if (tornDown) return;
    tornDown = true;
    cleanup();
    if (child) await exited(child, 10_000);
    if (instance?.ephemeral) {
      removeInstance(cliDirs(), instance.dir);
      console.log(`\nRemoved the ephemeral instance ${instance.name}.`);
    }
  }

  hooks.teardown = teardown;
  process.on('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void teardown().then(() => process.exit(0)));
  }

  if (instance) {
    console.log(`Instance ${instance.name}${instance.ephemeral ? ' (removed on exit)' : ''}`);
    console.log(`  ${instance.dir}`);
    console.log(`  abuddy db --data-dir "${instance.dir}" to read it\n`);
  }

  // The build and the app both read the @abuddy packages' dist; from a checkout that dist is built on demand
  ensureCheckoutPackages(root);

  console.log('Running initial build...\n');
  await build([]);

  // An app already on this data dir is the one to use: a second Electron over the same LMDB store is not a
  // choice anyone wants. Only an app this command started is one it may close.
  if (readApiEndpoint(apiPortFile)) {
    console.log(`Using the ${env} app already running.\n`);
  } else {
    console.log(`Starting ${app.kind === 'source' ? app.root : `AgentBuddy Beta ${app.version}`}...`);
    child = launchApp(app, place);
    await waitForApi(apiPortFile, child);
    console.log(`  up on ${env} data in ${userDataDir}\n`);
  }

  // After the app has started, so `readHostInfo` reads what this app records rather than a previous one's
  console.log(`Installing pack to the ${env} app...`);
  const result = await installToApp(root, place);
  console.log(`  ${result.dir}\n`);

  if (!feEntry) {
    console.log('No FE entry found. Falling back to watch + rebuild + reload mode.\n');
    await watchRebuildFallback(root, srcDir, manifest.id, place);
    return;
  }

  const vite = await import('vite');
  server = await vite.createServer(await packDevServerConfig(root, feEntry));

  const devServer = server as import('vite').ViteDevServer;
  await devServer.listen();
  const address = devServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  if (!port) {
    throw new Error('Vite dev server failed to bind a port');
  }

  // Outside the installed pack: its directory is the verified pack, replaced by every install below
  writeDevServerMarker(userDataDir, manifest.id, { port, pid: process.pid });
  markerFor = manifest.id;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  fs.watch(path.join(root, 'abuddy.json'), () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log('\nabuddy.json changed — regenerating entries...');
      try {
        const { generateEntries } = await import('./generate-entries');
        await generateEntries(['--force'], root);
      } catch (err) {
        console.error(`Regeneration failed: ${err instanceof Error ? err.message : err}`);
      }
    }, 300);
  });

  // BE file watcher: rebuild → install → hot-reload backend
  let beDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let beReloading = false;
  fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
    if (!filename || filename.endsWith('.vue') || filename.endsWith('.css')) return;
    if (!filename.endsWith('.ts') && !filename.endsWith('.tsx')) return;
    if (filename.endsWith('.d.ts')) return;
    if (beDebounceTimer) clearTimeout(beDebounceTimer);
    beDebounceTimer = setTimeout(async () => {
      if (beReloading) return;
      beReloading = true;
      try {
        console.log(`\nBE change detected: ${filename}`);
        console.log('Rebuilding...');
        await build([]);
        console.log('Installing...');
        await installToApp(root, place);
        console.log('Triggering BE reload...');
        reportReload(await reloadPack(manifest.id, place), 'BE changes');
      } catch {
        console.warn('Rebuild failed. Fix the error to apply BE changes.\n');
      } finally {
        beReloading = false;
      }
    }, 300);
  });

  console.log(`\nDev server running at http://localhost:${port}`);
  // Measured 2026-10-07: a `.vue` edit reloads the window, it does not patch the component. Vite decides that
  // because the pack's entry is imported by the app through `pack://`, outside Vite's module graph, so there is
  // no accepting importer for the update to stop at. Saying "HMR" promised the component-level thing.
  console.log(`FE changes reload the app's window (Vite watches this pack).`);
  console.log(`BE changes auto-rebuild and hot-reload via API.`);
  console.log('Press Ctrl+C to stop.\n');

  await new Promise(() => {});
}

async function watchRebuildFallback(root: string, srcDir: string, packId: string, place: AppPlace) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let reloading = false;

  function scheduleBuild(label: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (reloading) return;
      reloading = true;
      try {
        console.log(`\nChange detected: ${label}`);
        await build([]);
        await installToApp(root, place);
        reportReload(await reloadPack(packId, place), 'changes');
      } catch {
        console.warn('Rebuild failed. Fix the error to apply changes.\n');
      } finally {
        reloading = false;
      }
    }, 300);
  }

  fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
    if (!filename || filename.endsWith('.d.ts')) return;
    if (!filename.endsWith('.ts') && !filename.endsWith('.tsx') && !filename.endsWith('.vue') && !filename.endsWith('.css') && !filename.endsWith('.md')) return;
    scheduleBuild(filename);
  });

  fs.watch(path.join(root, 'abuddy.json'), () => {
    scheduleBuild('abuddy.json');
  });

  console.log('Watching src/ and abuddy.json... (Ctrl+C to stop)');
  await new Promise(() => {});
}
