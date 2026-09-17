import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from './build';
import { findPackRoot, readManifest } from '../utils';
import { findFEEntry, packExternalsPlugin } from '../build/fe-bundler';
import { API_HOST, API_TOKEN_HEADER, resolveAppContext } from '@abuddy/sdk/env';
import { installPackFromLocal, readHostVersion } from '@abuddy/host/packs';
import { removeDevServerMarker, writeDevServerMarker } from '@abuddy/host/packs/dev-server';

/** The running development app's API: its URL and the token it requires, from the files the API writes */
function getDevApi(): { url: string; token: string } | null {
  try {
    const { apiPortFile, apiTokenFile } = resolveAppContext({ env: 'development' });
    const port = fs.readFileSync(apiPortFile, 'utf-8').trim();
    const token = fs.readFileSync(apiTokenFile, 'utf-8').trim();
    return port && token ? { url: `http://${API_HOST}:${port}`, token } : null;
  } catch { return null; }
}

/**
 * Asks the running development app to reload a pack's runtime, with its API token. `not-running` when there's no
 * port or token file, `failed` when the app refused or couldn't reload, `unreachable` when nothing answered.
 */
export async function reloadDevPack(packId: string): Promise<'reloaded' | 'not-running' | 'failed' | 'unreachable'> {
  const api = getDevApi();
  if (!api) return 'not-running';
  try {
    const res = await fetch(`${api.url}/dev/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: api.token },
      body: JSON.stringify({ packId }),
    });
    return res.ok ? 'reloaded' : 'failed';
  } catch {
    return 'unreachable';
  }
}

/** Prints what a reload came to; `what` names the changes (`BE changes`, `changes`) */
function reportReload(result: Awaited<ReturnType<typeof reloadDevPack>>, what: string): void {
  if (result === 'reloaded') console.log('BE reloaded successfully.\n');
  else if (result === 'not-running') console.warn(`Dev app not running (no port or token file). Restart to apply ${what}.\n`);
  else if (result === 'failed') console.warn('BE reload failed. Restart the app to apply changes.\n');
  else console.warn(`Could not reach dev app. Restart to apply ${what}.\n`);
}

/** Installs into the dev data dir, checking hostVersion against the dev app that last used it. */
export function installToDev(root: string) {
  const { packsDir, userDataDir } = resolveAppContext({ env: 'development' });
  return installPackFromLocal(root, packsDir, { hostVersion: readHostVersion(userDataDir) });
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
      exclude: Object.keys((await import('@abuddy/host/build/shared-deps')).getSharedFeDeps()),
    },
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  if (!port) {
    throw new Error('Vite dev server failed to bind a port');
  }

  // Outside the installed pack: its directory is the verified bundle, replaced by every install below
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
