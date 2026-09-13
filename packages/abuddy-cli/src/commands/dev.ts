import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from './build';
import { findPackRoot, readManifest } from '../utils';
import { findFEEntry, packExternalsPlugin } from '../build/fe-bundler';
import { resolveAppContext } from '@abuddy/sdk/env';
import { installPackFromLocal } from '@abuddy/host/packs';

function getDevApiUrl(): string | null {
  try {
    const port = fs.readFileSync(resolveAppContext({ env: 'development' }).apiPortFile, 'utf-8').trim();
    return port ? `http://localhost:${port}` : null;
  } catch { return null; }
}

function writeSignalFile(packsDir: string, packId: string, port: number): string {
  const packDir = path.join(packsDir, packId);
  fs.mkdirSync(packDir, { recursive: true });
  const signalPath = path.join(packDir, '.dev');
  fs.writeFileSync(signalPath, JSON.stringify({ port, pid: process.pid }));
  return signalPath;
}

function removeSignalFile(signalPath: string) {
  try { fs.unlinkSync(signalPath); } catch {}
}

export async function dev(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const srcDir = path.join(root, 'src');

  if (!fs.existsSync(srcDir)) {
    throw new Error('No src/ directory to watch');
  }

  const manifest = readManifest(root);
  const feEntry = findFEEntry(root);
  const { packsDir } = resolveAppContext({ env: 'development' });

  console.log('Running initial build...\n');
  await build([]);

  console.log(`Installing pack to dev environment...`);
  const result = await installPackFromLocal(root, packsDir);
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

  const signalPath = writeSignalFile(packsDir, manifest.id, port);

  function cleanup() {
    removeSignalFile(signalPath);
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
        await installPackFromLocal(root, packsDir);
        console.log('Triggering BE reload...');
        const apiUrl = getDevApiUrl();
        if (!apiUrl) {
          console.warn('Dev app not running (no port file). Restart to apply BE changes.\n');
        } else {
          const res = await fetch(`${apiUrl}/dev/reload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packId: manifest.id }),
          });
          if (res.ok) {
            console.log('BE reloaded successfully.\n');
          } else {
            console.warn('BE reload failed. Restart the app to apply changes.\n');
          }
        }
      } catch {
        console.warn('Could not reach dev app. Restart to apply BE changes.\n');
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
        await installPackFromLocal(root, packsDir);
        const apiUrl = getDevApiUrl();
        if (!apiUrl) {
          console.warn('Dev app not running (no port file). Restart to apply changes.\n');
        } else {
          const res = await fetch(`${apiUrl}/dev/reload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packId }),
          });
          if (res.ok) {
            console.log('BE reloaded successfully.\n');
          } else {
            console.warn('BE reload failed. Restart the app to apply changes.\n');
          }
        }
      } catch {
        console.warn('Could not reach dev app. Restart to apply changes.\n');
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
