import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test';
export { expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { resolveAppContext } from '@abuddy/sdk/env';
import { installPackFromLocal } from '@abuddy/sdk/packs';

export interface AppHelper {
  sendEvent: (event: Record<string, unknown>) => Promise<void>;
  getState: () => Promise<unknown>;
  getContext: () => Promise<{ activePluginId: string; pluginIds: string[] }>;
  screenshot: (name: string) => Promise<Buffer>;
  navigate: (pluginId: string) => Promise<void>;
  waitForState: (check: string, timeout?: number) => Promise<void>;
  waitForPlugin: (pluginId: string, timeout?: number) => Promise<void>;
}

export interface CreateTestOptions {
  appRoot?: string;
  screenshotDir?: string;
}

function isValidAppRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'packages', 'entry-point.mjs'));
}

function validateAppRoot(dir: string): void {
  const missing: string[] = [];
  if (!isValidAppRoot(dir)) missing.push('packages/entry-point.mjs');
  if (!fs.existsSync(path.join(dir, 'node_modules', 'electron'))) missing.push('node_modules/electron (run npm install)');
  if (!fs.existsSync(path.join(dir, 'packages', 'main', 'dist'))) missing.push('packages/main/dist (run npm run build)');
  if (!fs.existsSync(path.join(dir, 'packages', 'renderer', 'dist'))) missing.push('packages/renderer/dist (run npm run build)');
  if (missing.length > 0) {
    throw new Error(
      `ABUDDY_ROOT (${dir}) is missing required files:\n` +
      missing.map(m => `  - ${m}`).join('\n') +
      '\n\nThe AgentBuddy monorepo must be cloned, installed, and built before E2E tests can run.',
    );
  }
}

function resolveAppRoot(override?: string): string {
  if (override) {
    const resolved = path.resolve(override);
    validateAppRoot(resolved);
    return resolved;
  }
  if (process.env.ABUDDY_ROOT) {
    const resolved = path.resolve(process.env.ABUDDY_ROOT);
    validateAppRoot(resolved);
    return resolved;
  }

  // Auto-detect: walk up from SDK package looking for packages/entry-point.mjs
  let dir = path.resolve(import.meta.dirname, '..', '..');
  for (let i = 0; i < 10; i++) {
    if (isValidAppRoot(dir)) {
      validateAppRoot(dir);
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    'Could not find AgentBuddy root. Set ABUDDY_ROOT env var to the AgentBuddy monorepo directory.\n\n' +
    'E2E tests require a local clone of the AgentBuddy repo with dependencies installed and packages built:\n' +
    '  git clone <agentbuddy-repo> && cd AgentBuddy && npm install && npm run build',
  );
}

function resolveScreenshotDir(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.PACK_DIR) return path.join(path.resolve(process.env.PACK_DIR), 'tests', 'screenshots');
  return path.join(process.cwd(), 'tests', 'screenshots');
}

function resolveAbuddyBin(appRoot: string): string {
  const localBin = path.join(process.cwd(), 'node_modules', '.bin', 'abuddy');
  if (fs.existsSync(localBin)) return localBin;
  const appBin = path.join(appRoot, 'node_modules', '.bin', 'abuddy');
  if (fs.existsSync(appBin)) return appBin;
  return 'abuddy';
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

const E2E_VIEWPORT = { width: 1400, height: 900 };

/** The pack's recorded install/seed error in the test app's pack registry, if any. */
function readPackLastError(packId: string, userDataDir: string): string | undefined {
  try {
    const registry = JSON.parse(fs.readFileSync(resolveAppContext({ env: 'test', userDataDir }).registryFile, 'utf-8'));
    return registry.packs?.find((p: { id: string }) => p.id === packId)?.lastError;
  } catch {
    return undefined;
  }
}

// Recent Electron stdout/stderr per app, so fixture failures can report the root
// cause (loader errors, crashes) without re-running under DEBUG_E2E.
const OUTPUT_TAIL_LINES = 200;
// Launch time per app, to report how long boot to a connected renderer took (once per worker)
const launchStartedAt = new WeakMap<ElectronApplication, number>();
const userDataDirs = new WeakMap<ElectronApplication, string>();
const outputTails = new WeakMap<ElectronApplication, string[]>();

function captureOutput(app: ElectronApplication): void {
  const tail: string[] = [];
  outputTails.set(app, tail);
  const onData = (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (!line.trim()) continue;
      tail.push(line);
      if (tail.length > OUTPUT_TAIL_LINES) tail.shift();
    }
  };
  app.process().stdout?.on('data', onData);
  app.process().stderr?.on('data', onData);
}

const ERROR_LINE = /error|exception|failed|cannot|not found|no machine export/i;

function describeFailure(message: string, app: ElectronApplication, rendererErrors: string[] = []): Error {
  const sections = [message];
  if (rendererErrors.length > 0) {
    sections.push('Renderer errors:\n' + rendererErrors.map(e => `  ${e}`).join('\n'));
  }
  const errorLines = (outputTails.get(app) ?? []).filter(l => ERROR_LINE.test(l)).slice(-30);
  if (errorLines.length > 0) {
    sections.push('Electron/API output (error lines):\n' + errorLines.map(l => `  ${l}`).join('\n'));
  }
  sections.push('Re-run with DEBUG_E2E=1 for full Electron output.');
  return new Error(sections.join('\n\n'));
}

async function findMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 45_000;

  for (const w of electronApp.windows()) {
    const has = await w.evaluate(() => !!(window as any).applicationState).catch(() => false);
    if (has) return w;
  }

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

    for (const w of electronApp.windows()) {
      const has = await w.evaluate(() => !!(window as any).applicationState).catch(() => false);
      if (has) return w;
    }
  }

  throw describeFailure('Main window with applicationState did not appear within timeout', electronApp);
}

export function createTest(options: CreateTestOptions = {}) {
  const appRoot = resolveAppRoot(options.appRoot);
  const screenshotDir = resolveScreenshotDir(options.screenshotDir);

  const test = base.extend<
    { appPage: Page; app: AppHelper },
    { electronApp: ElectronApplication }
  >({
    electronApp: [async ({}, use) => {
      // Every worker gets a fresh data dir: no data, installed packs or onboarding state leak
      // between runs or from other packs, and nothing touches the developer's abuddy-test dir
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-e2e-'));
      if (process.env.PACK_DIR) {
        const packDir = path.resolve(process.env.PACK_DIR);
        const manifest = getPackManifest();
        if (!manifest) throw new Error(`No abuddy.json found in PACK_DIR: ${packDir}`);
        // Always rebuild: installing an existing dist would silently test stale code
        const abuddyBin = resolveAbuddyBin(appRoot);
        console.log(`[pack] Building ${manifest.id} from ${packDir}...`);
        try {
          execSync(`${abuddyBin} build`, { cwd: packDir, stdio: 'pipe' });
        } catch (e: any) {
          const output = [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n') || e.message;
          throw new Error(`Pack build failed for ${manifest.id}:\n${output}`);
        }
        // Install through the same bundle path users get (stage → verify → place)
        const { packsDir } = resolveAppContext({ env: 'test', userDataDir });
        console.log(`[pack] Installing ${manifest.id} into an isolated test data dir...`);
        await installPackFromLocal(packDir, packsDir);
      }

      // Resolve electron binary from the monorepo so external packs don't need electron installed locally
      const appRequire = createRequire(path.join(appRoot, 'package.json'));
      const electronPath = appRequire('electron') as unknown as string;

      const launchStart = Date.now();
      const app = await _electron.launch({
        executablePath: electronPath,
        args: [path.join(appRoot, '.')],
        cwd: appRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_TEST: 'true',
          ABUDDY_USER_DATA_DIR: userDataDir,
        },
      });

      launchStartedAt.set(app, launchStart);
      userDataDirs.set(app, userDataDir);
      captureOutput(app);
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
      if (process.env.E2E_KEEP_DATA) {
        console.log(`[e2e] kept test data dir: ${userDataDir}`);
      } else {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    }, { scope: 'worker' }],

    appPage: async ({ electronApp }, use) => {
      const page = await findMainWindow(electronApp);
      // The main window's default size depends on how main was built (dev vs production mode);
      // pin the viewport so layout and screenshot baselines are the same everywhere
      await page.setViewportSize(E2E_VIEWPORT);

      const rendererErrors: string[] = [];
      let rejectPackFeFailed: (err: Error) => void = () => {};
      const packFeFailed = new Promise<never>((_, reject) => { rejectPackFeFailed = reject; });
      packFeFailed.catch(() => {}); // only observed while waiting for pack plugins
      const onPageError = (error: Error) => {
        console.error('[page error]', error);
        rendererErrors.push(`[page error] ${error.stack ?? error.message}`);
      };
      const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
        if (msg.type() === 'error') {
          console.error(`[console.error] ${msg.text()}`);
          rendererErrors.push(`[console.error] ${msg.text()}`);
          // Only the pack under test fails fast; other installed packs' errors are just reported
          const packId = getPackManifest()?.id;
          if (packId && msg.text().includes(`[pack-loader] Failed to load FE entry pack://${packId}/`)) {
            rejectPackFeFailed(describeFailure('Pack FE failed to load', electronApp, rendererErrors));
          }
        }
      };
      page.on('pageerror', onPageError);
      page.on('console', onConsole);

      const waitOrDescribe = async (what: string, wait: Promise<unknown>) => {
        try {
          await wait;
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Pack FE failed to load')) throw err;
          throw describeFailure(`${what}: ${(err as Error).message.split('\n')[0]}`, electronApp, rendererErrors);
        }
      };

      await waitOrDescribe('App did not reach connected state', page.waitForFunction(() => {
        const snap = (window as any).applicationState?.getSnapshot();
        if (!snap) return false;
        const val = snap.value;
        if (typeof val === 'object' && val !== null) {
          if ('running' in val) return val.running === 'connected';
          if ('onboarding' in val) return true;
        }
        return false;
      }, null, { timeout: 45_000 }));

      const startedAt = launchStartedAt.get(electronApp);
      if (startedAt !== undefined) {
        launchStartedAt.delete(electronApp);
        console.log(`[e2e] app connected ${Date.now() - startedAt}ms after launch`);
      }

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
        // Seeding runs before the backend accepts connections, so its outcome is final by now
        const seedError = manifest && readPackLastError(manifest.id, userDataDirs.get(electronApp)!);
        if (seedError) {
          throw describeFailure(`Pack ${manifest!.id} failed to seed its data:\n${seedError}`, electronApp, rendererErrors);
        }
        if (manifest && manifest.pluginIds.length > 0) {
          for (const pluginId of manifest.pluginIds) {
            // Fail on the captured loader error as soon as it appears instead of timing out later
            await waitOrDescribe(`Pack plugin "${pluginId}" did not load within 30s`, Promise.race([
              packFeFailed,
              page.waitForFunction((id) => {
                const snap = (window as any).applicationState?.getSnapshot();
                return snap?.context?.plugins?.some((p: any) => p.id === id);
              }, pluginId, { timeout: 30_000 }),
            ]));
          }
        }
      }

      await use(page);

      page.removeListener('pageerror', onPageError);
      page.removeListener('console', onConsole);
    },

    app: async ({ appPage: page }, use) => {
      fs.mkdirSync(screenshotDir, { recursive: true });

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
          const filePath = path.join(screenshotDir, `${name}.png`);
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

  return { test, expect: base.expect };
}

// Direct exports — auto-resolve appRoot from ABUDDY_ROOT env var or by walking up from SDK location
const _default = createTest();
export const test = _default.test;
