import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from './build';
import { findPackRoot, readManifest } from '../utils';
import { findFEEntry, packExternalsPlugin } from '../../build/fe-bundler';
import { getPacksDir } from '../../packs/pack-discovery';

function writeSignalFile(packId: string, port: number): string {
  const packsDir = getPacksDir();
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

  console.log('Running initial build...\n');
  await build([]);

  if (!feEntry) {
    console.log('No FE entry found. Falling back to watch + rebuild mode.\n');
    await watchRebuildFallback(root, srcDir);
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
            if (req.url === '/dist/fe.js' || req.url === '/@id/fe') {
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
      exclude: Object.keys((await import('../../shared-deps')).getSharedFeDeps()),
    },
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  if (!port) {
    throw new Error('Vite dev server failed to bind a port');
  }

  const signalPath = writeSignalFile(manifest.id, port);

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

  console.log(`\nDev server running at http://localhost:${port}`);
  console.log(`FE changes hot-reload. BE changes require app restart.`);
  console.log('Press Ctrl+C to stop.\n');

  await new Promise(() => {});
}

async function watchRebuildFallback(root: string, srcDir: string) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleBuild(label: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`\nChange detected: ${label}`);
      try {
        await build([]);
      } catch (err) {
        console.error(`Build failed: ${err instanceof Error ? err.message : err}`);
      }
    }, 300);
  }

  fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
    if (!filename || filename.endsWith('.d.ts')) return;
    if (!filename.endsWith('.ts') && !filename.endsWith('.tsx') && !filename.endsWith('.vue') && !filename.endsWith('.md')) return;
    scheduleBuild(filename);
  });

  fs.watch(path.join(root, 'abuddy.json'), () => {
    scheduleBuild('abuddy.json');
  });

  console.log('Watching src/ and abuddy.json... (Ctrl+C to stop)');
  await new Promise(() => {});
}
