import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from './build';
import { findPackRoot, readManifest } from '../utils';
import { findFEEntry, packExternalsPlugin } from '../build/fe-bundler';
import { resolveAppContext } from '@abuddy/sdk/env';
import { readApiEndpoint } from '@abuddy/host/process-liveness';
import { API_HOST, API_TOKEN_HEADER } from '@abuddy/sdk/utils/pure';
import { installPackFromLocal, readHostInfo } from '@abuddy/host/packs';
import { removeDevServerMarker, writeDevServerMarker } from '@abuddy/host/packs/dev-server';

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The running development app's API: its URL and the token it requires, from the files the API writes */
function findDevApi(): { api: { url: string; token: string } } | { problem: string } {
  const { apiPortFile, apiTokenFile } = resolveAppContext({ env: 'development' });
  const endpoint = readApiEndpoint(apiPortFile);
  if (!endpoint) return { problem: `no running development app in ${apiPortFile}` };
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

/** Asks the running development app to reload a pack's runtime, with its API token. */
export async function reloadDevPack(packId: string): Promise<DevReload> {
  const found = findDevApi();
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
  else if (result.status === 'not-running') console.warn(`Dev app not running (${result.detail}). Restart to apply ${what}.\n`);
  else if (result.status === 'failed') console.warn(`The dev app refused the reload (${result.detail}). Restart the app to apply ${what}.\n`);
  else console.warn(`Could not reach the dev app (${result.detail}). Restart to apply ${what}.\n`);
}

/** Installs into the dev data dir, checking hostVersion and the build format against the dev app that last used it. */
export function installToDev(root: string) {
  const { packsDir, userDataDir } = resolveAppContext({ env: 'development' });
  const { version: hostVersion, packFormat } = readHostInfo(userDataDir);
  return installPackFromLocal(root, packsDir, { hostVersion, packFormat });
}

export async function dev(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const srcDir = path.join(root, 'src');

  if (!fs.existsSync(srcDir)) {
    throw new Error('No src/ directory to watch');
  }

  const manifest = readManifest(root);
  const feEntry = findFEEntry(root);
  const { packsDir, userDataDir } = resolveAppContext({ env: 'development' });

  // The build and the app both read the @abuddy packages' dist; from a checkout that dist is built on demand
  ensureCheckoutPackages(root);

  console.log('Running initial build...\n');
  await build([]);

  console.log(`Installing pack to dev environment...`);
  const result = await installToDev(root);
  console.log(`  ${result.dir}\n`);

  if (!feEntry) {
    console.log('No FE entry found. Falling back to watch + rebuild + reload mode.\n');
    await watchRebuildFallback(root, srcDir, manifest.id, packsDir);
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
        console.log('Installing to dev...');
        await installToDev(root);
        console.log('Triggering BE reload...');
        reportReload(await reloadDevPack(manifest.id), 'BE changes');
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

async function watchRebuildFallback(root: string, srcDir: string, packId: string, packsDir: string) {
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
        await installToDev(root);
        reportReload(await reloadDevPack(packId), 'changes');
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
