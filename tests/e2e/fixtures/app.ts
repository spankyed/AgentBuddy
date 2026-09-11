import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getPacksDirForEnv } from '../../../packages/abuddy-sdk/src/packs/pack-discovery';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCREENSHOT_DIR = path.join(ROOT, 'tests', 'screenshots');

function syncPackToDevDir(src: string, dest: string): void {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      syncPackToDevDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

let _packManifest: { id: string; pluginIds: string[] } | null | undefined;
function getPackManifest(): { id: string; pluginIds: string[] } | null {
  if (_packManifest !== undefined) return _packManifest;
  if (!process.env.PACK_DIR) { _packManifest = null; return null; }
  const manifestPath = path.join(path.resolve(process.env.PACK_DIR), 'abuddy.json');
  if (!fs.existsSync(manifestPath)) { _packManifest = null; return null; }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  _packManifest = {
    id: manifest.id,
    pluginIds: (manifest.features ?? [])
      .filter((f: any) => f.plugin)
      .map((f: any) => f.plugin?.id ?? f.id),
  };
  return _packManifest;
}

export interface AppHelper {
  sendEvent: (event: Record<string, unknown>) => Promise<void>;
  getState: () => Promise<unknown>;
  getContext: () => Promise<{ activePluginId: string; pluginIds: string[] }>;
  screenshot: (name: string) => Promise<Buffer>;
  navigate: (pluginId: string) => Promise<void>;
  waitForState: (check: string, timeout?: number) => Promise<void>;
  waitForPlugin: (pluginId: string, timeout?: number) => Promise<void>;
}

async function findMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 45_000;

  // Check if any existing window has applicationState (the renderer, not the splash)
  for (const w of electronApp.windows()) {
    const has = await w.evaluate(() => !!(window as any).applicationState).catch(() => false);
    if (has) return w;
  }

  // Wait for new windows and check each
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    try {
      const newPage = await electronApp.waitForEvent('window', { timeout: Math.min(remaining, 5000) });
      await (newPage as Page).waitForLoadState('domcontentloaded').catch(() => {});
      const has = await (newPage as Page).evaluate(() => !!(window as any).applicationState).catch(() => false);
      if (has) return newPage as Page;
    } catch {
      // Timeout on waitForEvent — check all existing windows again
    }

    // Re-check existing windows (applicationState may have become available)
    for (const w of electronApp.windows()) {
      const has = await w.evaluate(() => !!(window as any).applicationState).catch(() => false);
      if (has) return w;
    }
  }

  throw new Error('Main window with applicationState did not appear within timeout');
}

export const test = base.extend<
  { appPage: Page; app: AppHelper },
  { electronApp: ElectronApplication }
>({
  electronApp: [async ({}, use) => {
    if (process.env.PACK_DIR) {
      const packDir = path.resolve(process.env.PACK_DIR);
      const manifest = getPackManifest();
      if (!manifest) throw new Error(`No abuddy.json found in PACK_DIR: ${packDir}`);
      const devPacksDir = getPacksDirForEnv(true);
      const devSignal = path.join(devPacksDir, manifest.id, '.dev');
      if (!fs.existsSync(devSignal)) {
        if (!fs.existsSync(path.join(packDir, 'dist'))) {
          const abuddyBin = path.join(ROOT, 'node_modules', '.bin', 'abuddy');
          console.log(`[pack] Building ${manifest.id} from ${packDir}...`);
          try {
            execSync(`${abuddyBin} build`, { cwd: packDir, stdio: 'pipe' });
          } catch (e: any) {
            const stderr = e.stderr?.toString() || e.message;
            throw new Error(`Pack build failed for ${manifest.id}:\n${stderr}`);
          }
        }
        console.log(`[pack] Syncing ${manifest.id} to dev packs directory...`);
        syncPackToDevDir(packDir, path.join(devPacksDir, manifest.id));
      } else {
        console.log(`[pack] abuddy dev is running for ${manifest.id}, skipping build/sync`);
      }
    }

    const app = await _electron.launch({
      args: ['.'],
      cwd: ROOT,
      env: {
        ...process.env,
        PLAYWRIGHT_TEST: 'true',
      },
    });

    if (process.env.DEBUG_E2E) {
      app.process().stdout?.on('data', (data: Buffer) => {
        process.stdout.write(`[electron] ${data}`);
      });
      app.process().stderr?.on('data', (data: Buffer) => {
        process.stderr.write(`[electron] ${data}`);
      });
    }

    await use(app);
    await app.close();
  }, { scope: 'worker' }],

  appPage: async ({ electronApp }, use) => {
    const page = await findMainWindow(electronApp);

    let packFeFailed = false;
    const onPageError = (error: Error) => console.error('[page error]', error);
    const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
      if (msg.type() === 'error') {
        console.error(`[console.error] ${msg.text()}`);
        if (msg.text().includes('[pack-loader] Failed to load FE entry')) packFeFailed = true;
      }
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    // Wait for app to reach a usable state (connected or onboarding)
    await page.waitForFunction(() => {
      const snap = (window as any).applicationState?.getSnapshot();
      if (!snap) return false;
      const val = snap.value;
      if (typeof val === 'object' && val !== null) {
        if ('running' in val) return val.running === 'connected';
        if ('onboarding' in val) return true;
      }
      return false;
    }, null, { timeout: 45_000 });

    // Bypass onboarding if needed
    const inOnboarding = await page.evaluate(() => {
      const snap = (window as any).applicationState?.getSnapshot();
      return snap && typeof snap.value === 'object' && 'onboarding' in snap.value;
    });
    if (inOnboarding) {
      await page.evaluate(() => (window as any).__disableOnboardingUI?.());
      await page.waitForFunction(() => {
        const snap = (window as any).applicationState?.getSnapshot();
        return snap?.value?.running === 'connected';
      }, null, { timeout: 10_000 });
    }

    if (process.env.PACK_DIR) {
      const manifest = getPackManifest();
      if (manifest && manifest.pluginIds.length > 0) {
        for (const pluginId of manifest.pluginIds) {
          if (packFeFailed) {
            console.warn(`[pack] Pack FE failed to load — skipping wait for "${pluginId}"`);
            continue;
          }
          try {
            await page.waitForFunction((id) => {
              const snap = (window as any).applicationState?.getSnapshot();
              return snap?.context?.plugins?.some((p: any) => p.id === id);
            }, pluginId, { timeout: 30_000 });
          } catch {
            console.warn(`[pack] Plugin "${pluginId}" did not load within 30s — pack FE may have failed`);
          }
        }
      }
    }

    await use(page);

    page.removeListener('pageerror', onPageError);
    page.removeListener('console', onConsole);
  },

  app: async ({ appPage: page }, use) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const app: AppHelper = {
      sendEvent: async (event) => {
        await page.evaluate((e) => {
          (window as any).applicationState.send(e);
        }, event);
      },

      getState: async () => {
        return page.evaluate(() => {
          return (window as any).applicationState?.getSnapshot()?.value;
        });
      },

      getContext: async () => {
        return page.evaluate(() => {
          const snap = (window as any).applicationState?.getSnapshot();
          return {
            activePluginId: snap?.context?.activePlugin?.id ?? '',
            pluginIds: (snap?.context?.plugins ?? []).map((p: any) => p.id),
          };
        });
      },

      screenshot: async (name) => {
        const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
        return page.screenshot({ path: filePath });
      },

      navigate: async (pluginId) => {
        await page.evaluate((id) => {
          (window as any).applicationState.send({ type: 'SELECT_PLUGIN', pluginId: id });
        }, pluginId);
        await page.waitForFunction((id) => {
          const snap = (window as any).applicationState?.getSnapshot();
          return snap?.context?.activePlugin?.id === id;
        }, pluginId, { timeout: 10_000 });
        // Let the plugin UI render
        await page.waitForTimeout(500);
      },

      waitForPlugin: async (pluginId, timeout = 30_000) => {
        await page.waitForFunction((id) => {
          const snap = (window as any).applicationState?.getSnapshot();
          return snap?.context?.plugins?.some((p: any) => p.id === id);
        }, pluginId, { timeout });
      },

      waitForState: async (check, timeout = 10_000) => {
        await page.waitForFunction((c) => {
          const snap = (window as any).applicationState?.getSnapshot();
          const val = snap?.value;
          if (typeof val === 'object' && val !== null) {
            const parts = c.split('.');
            let current: any = val;
            for (const part of parts) {
              if (typeof current === 'object' && current !== null && part in current) {
                current = current[part];
              } else if (current === part) {
                return true;
              } else {
                return false;
              }
            }
            return true;
          }
          return val === c;
        }, check, { timeout });
      },
    };

    await use(app);
  },
});

export { expect } from '@playwright/test';
