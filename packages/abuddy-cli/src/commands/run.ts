import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from './build';
import { findPackRoot, readManifest } from '../utils';
import { findFEEntry, packExternalsPlugin } from '../build/fe-bundler';
import { parseAppFlags, resolveDevelopmentApp, type AppTarget } from '../app/app-target';
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
hot-reload through Vite, BE changes rebuild, reinstall and reload in place.

An app already running on the same data dir is used as it is; otherwise one is launched, and
closing this command closes the app it started.

Options:
  --app-root <path>   a local AgentBuddy checkout (installed and built)
  --app beta          the newest AgentBuddy Beta build that satisfies the pack's hostVersion
  --help, -h          Show this help

With neither, the app saved on first run is used, and you are asked once if there is none.
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

/** The running app's API: its URL and the token it requires, from the files the API writes */
function findAppApi(env: AppEnv): { api: { url: string; token: string } } | { problem: string } {
  const { apiPortFile, apiTokenFile } = resolveAppContext({ env });
  const endpoint = readApiEndpoint(apiPortFile);
  if (!endpoint) return { problem: `no running ${env} app in ${apiPortFile}` };
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
export async function reloadPack(packId: string, env: AppEnv = 'development'): Promise<DevReload> {
  const found = findAppApi(env);
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
export function installToApp(root: string, env: AppEnv = 'development') {
  const { packsDir, userDataDir } = resolveAppContext({ env });
  const { version: hostVersion, packFormat } = readHostInfo(userDataDir);
  return installPackFromLocal(root, packsDir, { hostVersion, packFormat });
}

/**
 * The app's environment, minus this process's own. Two things have to go: ELECTRON_RUN_AS_NODE, which the
 * app-bundled `abuddy` sets and which would start Electron as plain Node, and the `@abuddy/source`
 * condition, since a checkout's app declares its own and a packaged one must not resolve source at all.
 */
function appLaunchEnv(env: AppEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') out[key] = value;
  }
  const nodeOptions = withoutSourceCondition(out.NODE_OPTIONS);
  if (nodeOptions) out.NODE_OPTIONS = nodeOptions;
  else delete out.NODE_OPTIONS;
  // Only a source run reads this; a packaged build stamps its channel (see `appEnv`)
  out.ABUDDY_ENV = env;
  return out;
}

/** Starts the app. A checkout runs its own sources with its own electron, so a pack needs none installed. */
function launchApp(app: AppTarget, env: AppEnv): ChildProcess {
  const options = { env: appLaunchEnv(env), stdio: 'ignore' as const, detached: false };
  if (app.kind === 'source') {
    const electron = createRequire(path.join(app.root, 'package.json'))('electron') as string;
    return spawn(electron, [app.root], { ...options, cwd: app.root });
  }
  return spawn(app.executable, [], options);
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

export async function run(args: string[]) {
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

  const flags = parseAppFlags(args);
  const app = await resolveDevelopmentApp({ flags, hostVersion: manifest.hostVersion ?? '*' });
  const env = appEnv(app);
  const { userDataDir, apiPortFile } = resolveAppContext({ env });

  // The build and the app both read the @abuddy packages' dist; from a checkout that dist is built on demand
  ensureCheckoutPackages(root);

  console.log('Running initial build...\n');
  await build([]);

  // An app already on this data dir is the one to use: a second Electron over the same LMDB store is not a
  // choice anyone wants. Only an app this command started is one it may close.
  let child: ChildProcess | undefined;
  if (readApiEndpoint(apiPortFile)) {
    console.log(`Using the ${env} app already running.\n`);
  } else {
    console.log(`Starting ${app.kind === 'source' ? app.root : `AgentBuddy Beta ${app.version}`}...`);
    child = launchApp(app, env);
    await waitForApi(apiPortFile, child);
    console.log(`  up on ${env} data in ${userDataDir}\n`);
  }

  // After the app has started, so `readHostInfo` reads what this app records rather than a previous one's
  console.log(`Installing pack to the ${env} app...`);
  const result = await installToApp(root, env);
  console.log(`  ${result.dir}\n`);

  if (!feEntry) {
    console.log('No FE entry found. Falling back to watch + rebuild + reload mode.\n');
    await watchRebuildFallback(root, srcDir, manifest.id, env);
    return;
  }

  const vite = await import('vite');
  const vue = (await import('@vitejs/plugin-vue')).default;

  const entryRelative = '/' + path.relative(root, feEntry);

  const server = await vite.createServer({
    root,
    configFile: false,
    plugins: [
      packExternalsPlugin(root),
      vue(),
      {
        name: 'pack-entry-redirect',
        configureServer(srv) {
          srv.middlewares.use((req, _res, next) => {
            if (req.url === '/runtime/fe.js' || req.url === '/dist/fe.js' || req.url === '/@id/fe') {
              req.url = entryRelative;
            }
            next();
          });
        },
      },
    ],
    server: {
      port: 5199,
      strictPort: false,
      cors: true,
      hmr: {
        protocol: 'ws',
        host: 'localhost',
      },
    },
    logLevel: 'info',
    optimizeDeps: {
      exclude: Object.keys((await import('@abuddy/host/build/shared-deps')).getSharedFeDeps(root)),
    },
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  if (!port) {
    throw new Error('Vite dev server failed to bind a port');
  }

  // Outside the installed pack: its directory is the verified pack, replaced by every install below
  writeDevServerMarker(userDataDir, manifest.id, { port, pid: process.pid });

  function cleanup() {
    removeDevServerMarker(userDataDir, manifest.id);
    server.close();
    // Only one this command launched: an app that was already up outlives it
    child?.kill();
  }

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

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
        await installToApp(root, env);
        console.log('Triggering BE reload...');
        reportReload(await reloadPack(manifest.id, env), 'BE changes');
      } catch {
        console.warn('Rebuild failed. Fix the error to apply BE changes.\n');
      } finally {
        beReloading = false;
      }
    }, 300);
  });

  console.log(`\nDev server running at http://localhost:${port}`);
  console.log(`FE changes hot-reload via Vite HMR.`);
  console.log(`BE changes auto-rebuild and hot-reload via API.`);
  console.log('Press Ctrl+C to stop.\n');

  await new Promise(() => {});
}

async function watchRebuildFallback(root: string, srcDir: string, packId: string, env: AppEnv) {
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
        await installToApp(root, env);
        reportReload(await reloadPack(packId, env), 'changes');
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
