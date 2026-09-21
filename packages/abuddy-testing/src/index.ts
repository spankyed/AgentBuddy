import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test';
export { expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { resolveAppContext } from '@abuddy/sdk/env';
import { resolveName } from '@abuddy/sdk/ids';
import { installPackFromLocal, PACK_LOAD_MESSAGES } from '@abuddy/host/packs';
import { appVersion } from './app-version.ts';
import { appLaunchEnv } from './launch-env.ts';
import { assertCheckoutPackagesFresh } from './checkout-freshness.ts';

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
  /** A built AgentBuddy checkout to launch from source */
  appRoot?: string;
  /** A packaged AgentBuddy executable (e.g. AgentBuddy Beta.app/Contents/MacOS/AgentBuddy Beta) */
  appExecutable?: string;
  screenshotDir?: string;
}

/** How the fixture launches AgentBuddy: from a checkout's sources, or a packaged build. */
type AppLaunch = { kind: 'source'; root: string } | { kind: 'packaged'; executable: string };

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
      `AgentBuddy checkout ${dir} is missing required files:\n` +
      missing.map(m => `  - ${m}`).join('\n') +
      '\n\nThe AgentBuddy monorepo must be cloned, installed, and built before E2E tests can run.',
    );
  }
}

function sourceApp(dir: string): AppLaunch {
  const root = path.resolve(dir);
  validateAppRoot(root);
  return { kind: 'source', root };
}

function packagedApp(executable: string): AppLaunch {
  if (!fs.existsSync(executable)) throw new Error(`AgentBuddy executable not found: ${executable}`);
  return { kind: 'packaged', executable };
}

function resolveApp(options: CreateTestOptions): AppLaunch {
  if (options.appExecutable) return packagedApp(options.appExecutable);
  if (options.appRoot) return sourceApp(options.appRoot);
  // Set by `abuddy test` for a downloaded app build
  if (process.env.ABUDDY_APP_EXECUTABLE) return packagedApp(process.env.ABUDDY_APP_EXECUTABLE);
  if (process.env.ABUDDY_ROOT) return sourceApp(process.env.ABUDDY_ROOT);

  // Auto-detect: walk up from this package looking for packages/entry-point.mjs (inside the monorepo)
  let dir = path.resolve(import.meta.dirname, '..', '..');
  for (let i = 0; i < 10; i++) {
    if (isValidAppRoot(dir)) return sourceApp(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    'Could not find an AgentBuddy app to test against. Run the tests with `abuddy test`, which ' +
    'resolves one (--app-root <path>, --app beta, or your saved choice), or set ABUDDY_ROOT to a built AgentBuddy checkout.',
  );
}

function resolveScreenshotDir(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.PACK_DIR) return path.join(path.resolve(process.env.PACK_DIR), 'tests', 'screenshots');
  return path.join(process.cwd(), 'tests', 'screenshots');
}

/** The abuddy CLI bin that builds the pack under test. */
function resolveAbuddyBin(app: AppLaunch, packDir: string): string {
  // `abuddy test` passes itself, so the build uses the same CLI as the test run
  if (process.env.ABUDDY_CLI) return process.env.ABUDDY_CLI;
  const bases = [path.join(packDir, 'package.json'), ...(app.kind === 'source' ? [path.join(app.root, 'package.json')] : [])];
  for (const base of bases) {
    try {
      return path.join(path.dirname(createRequire(base).resolve('@abuddy/cli/package.json')), 'bin', 'abuddy.mjs');
    } catch {}
  }
  throw new Error('Could not find the abuddy CLI to build the pack. Install it in the pack (npm i -D @abuddy/cli) or run the tests with `abuddy test`.');
}

/** The newest thing under `dir`, or 0 when there is nothing there. */
function newestMtime(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .reduce((newest, entry) => Math.max(newest, fs.statSync(path.join(entry.parentPath, entry.name)).mtimeMs), 0);
}

/**
 * Refuses a packed archive older than the build it was supposed to come from.
 *
 * `PACK_ARCHIVE` is the one way past this fixture's rule that a pack is rebuilt before it is tested, and
 * the rule is there because a stale build tested silently is worse than no test. Installing the artifact
 * a release ships is a good reason to skip the rebuild; installing one from before the last change is
 * not, and the two look identical from the outside.
 */
function assertArchiveIsCurrent(archive: string, packDir: string): void {
  if (!fs.existsSync(archive)) throw new Error(`PACK_ARCHIVE does not exist: ${archive}`);
  const built = newestMtime(path.join(packDir, 'dist'));
  if (built === 0) return; // nothing built beside it to be older than
  if (fs.statSync(archive).mtimeMs >= built) return;
  throw new Error(
    `PACK_ARCHIVE is older than the pack's build, so it would be testing code that has since changed:\n` +
    `  archive: ${archive}\n  built:   ${path.join(packDir, 'dist')}\n` +
    'Pack it again, or unset PACK_ARCHIVE to build and install from source.',
  );
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
    // The ids the plugins run under: a plugin is addressed `<packId>.<featureId>`, as a system is
    pluginIds: (manifest.features ?? [])
      .filter((f: any) => f.plugin)
      .map((f: any) => resolveName(f.id, { packId: manifest.id })),
  };
  return _packManifest;
}

const E2E_VIEWPORT = { width: 1400, height: 900 };

/** The pack's recorded install/seed error in the test app's installed packs, if any. */
function readPackLastError(packId: string, userDataDir: string): string | undefined {
  try {
    const registry = JSON.parse(fs.readFileSync(resolveAppContext({ env: 'test', userDataDir }).installedPacksFile, 'utf-8'));
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

/** What the pack loader said about the pack under test, kept whole while the tail scrolls past it. */
type PackLoad = { registered?: true; failure?: string };
const packLoads = new WeakMap<ElectronApplication, PackLoad>();

function captureOutput(app: ElectronApplication): void {
  const tail: string[] = [];
  outputTails.set(app, tail);
  const packLoad: PackLoad = {};
  packLoads.set(app, packLoad);
  const packId = getPackManifest()?.id;
  // The loader logs one line per outcome for every pack it reaches, and those lines are its contract with
  // this fixture (`PACK_LOAD_MESSAGES`, `@abuddy/host/packs`), not prose it happens to print. Watched from
  // the launch because the tail only keeps the last few hundred lines and the app has usually logged past
  // boot by the time a test asks.
  const escaped = packId?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const registered = escaped && new RegExp(`${PACK_LOAD_MESSAGES.registered} ${escaped}\\b`);
  const failed = escaped && new RegExp(`(${PACK_LOAD_MESSAGES.notLoaded.join('|')}) ${escaped}\\b`);
  const onData = (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (!line.trim()) continue;
      tail.push(line);
      if (tail.length > OUTPUT_TAIL_LINES) tail.shift();
      if (registered && registered.test(line)) packLoad.registered = true;
      else if (failed && failed.test(line) && !packLoad.failure) packLoad.failure = line.trim();
    }
  };
  app.process().stdout?.on('data', onData);
  app.process().stderr?.on('data', onData);
}

/**
 * Waits for the pack under test to have been loaded and registered by the app's backend.
 *
 * Nothing else in this fixture observes the backend: seeding reports only its own failures, and the
 * plugin wait below covers a pack with a frontend. A backend-only pack whose systems never registered
 * — an incompatible hostVersion, an unsupported layout, a throw in its runtime — would otherwise pass
 * its whole suite while dead, because every test it runs asks the app about something else.
 */
/** The registered plugin ids, and among them the host's (the bare ones) */
async function registeredPlugins(page: Page): Promise<{ ids: string[]; hostIds: string[] }> {
  const ids: string[] = await page.evaluate(() =>
    ((window as any).applicationState?.getSnapshot()?.context?.plugins ?? []).map((p: { id: string }) => p.id));
  return { ids, hostIds: ids.filter((id) => !id.includes('.')) };
}

/**
 * The id a spec's plugin name addresses, as the pack under test's own code names plugins: its features by
 * id, another pack's as `<packId>/<featureId>`, a host plugin bare.
 */
async function resolvePlugin(page: Page, name: string): Promise<string> {
  const { hostIds } = await registeredPlugins(page);
  return resolveName(name, { packId: getPackManifest()?.id, hostIds });
}

async function waitForPackBackend(app: ElectronApplication, packId: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const load = packLoads.get(app);
    if (load?.registered) return;
    if (load?.failure) throw describeFailure(`Pack ${packId} was not loaded by the app:\n  ${load.failure}`, app);
    if (Date.now() >= deadline) {
      throw describeFailure(`Pack ${packId} was not loaded by the app within ${timeoutMs / 1000}s (the loader never reached it)`, app);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
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
  const appLaunch = resolveApp(options);
  const screenshotDir = resolveScreenshotDir(options.screenshotDir);

  const test = base.extend<
    { appPage: Page; app: AppHelper },
    { electronApp: ElectronApplication }
  >({
    electronApp: [async ({}, use) => {
      // From a checkout this fixture is built on demand, and a stale build tests the previous app
      assertCheckoutPackagesFresh();
      // Every worker gets a fresh data dir: no data, installed packs or onboarding state leak
      // between runs or from other packs, and nothing touches the developer's abuddy-test dir
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-e2e-'));
      // Removed however the worker ends, including a failed pack build or launch
      try {
        if (process.env.PACK_DIR) {
          const packDir = path.resolve(process.env.PACK_DIR);
          const manifest = getPackManifest();
          if (!manifest) throw new Error(`No abuddy.json found in PACK_DIR: ${packDir}`);
          // PACK_ARCHIVE names a packed .tgz to install as it is, so a run can exercise the artifact a
          // release ships rather than another build of the same source. Everything else — the plugin ids
          // the fixture waits for, the screenshot directory — still comes from PACK_DIR.
          const archive = process.env.PACK_ARCHIVE ? path.resolve(process.env.PACK_ARCHIVE) : undefined;
          if (archive) assertArchiveIsCurrent(archive, packDir);
          if (!archive) {
            // Always rebuild: installing an existing dist would silently test stale code
            const abuddyBin = resolveAbuddyBin(appLaunch, packDir);
            // A release run tests what it ships: without this the rebuild below replaces the release
            // build with a development one, and the archive is cut from that.
            const buildArgs = process.env.ABUDDY_PACK_RELEASE ? ['build', '--release'] : ['build'];
            console.log(`[pack] Building ${manifest.id} from ${packDir}${process.env.ABUDDY_PACK_RELEASE ? ' (release)' : ''}...`);
            try {
              execFileSync(process.execPath, [abuddyBin, ...buildArgs], { cwd: packDir, stdio: 'pipe' });
            } catch (e: any) {
              const output = [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n') || e.message;
              throw new Error(`Pack build failed for ${manifest.id}:\n${output}`);
            }
          }
          // Install through the same bundle path users get (stage → verify → place)
          const { packsDir } = resolveAppContext({ env: 'test', userDataDir });
          console.log(`[pack] Installing ${manifest.id} from ${archive ?? packDir} into an isolated test data dir...`);
          await installPackFromLocal(archive ?? packDir, packsDir, { hostVersion: appVersion(appLaunch) });
        }

        // A checkout runs its sources with its own electron, so packs don't need electron installed
        const launch = appLaunch.kind === 'source'
          ? {
            executablePath: createRequire(path.join(appLaunch.root, 'package.json'))('electron') as unknown as string,
            args: [path.join(appLaunch.root, '.')],
            cwd: appLaunch.root,
          }
          : { executablePath: appLaunch.executable, args: [] };

        const launchStart = Date.now();
        const app = await _electron.launch({
          ...launch,
          env: appLaunchEnv(process.env, userDataDir),
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
      } finally {
        if (process.env.E2E_KEEP_DATA) {
          console.log(`[e2e] kept test data dir: ${userDataDir}`);
        } else {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        }
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

      /**
       * Every send the bus dropped during the test, collected from the app's own SYSTEM_ERROR events.
       *
       * A send to a plugin nobody declares is the failure the outgoing check exists to catch, and it is
       * reported quietly (`diagnostic`, so it raises no toast) — which means without this it would sit
       * in the log and fail nothing. `takeSystemErrors()` does the same job for unit tests; this is its
       * counterpart for a running app, and it found a real one the first time it ran: the settings
       * system treated `_meta`, the reserved key for plugin visibility, as a plugin id.
       */
      await page.evaluate(() => {
        const win = window as any;
        if (win.__droppedSends) return;
        win.__droppedSends = [];
        win.applicationState?.system?.inspect?.((inspection: any) => {
          const event = inspection?.event;
          if (inspection?.type !== '@xstate.event' || event?.type !== 'SYSTEM_ERROR') return;
          if (event.operation === 'sendToPlugin') win.__droppedSends.push(String(event.message ?? ''));
        });
      });

      if (process.env.PACK_DIR) {
        const manifest = getPackManifest();
        // Seeding runs before the backend accepts connections, so its outcome is final by now
        const seedError = manifest && readPackLastError(manifest.id, userDataDirs.get(electronApp)!);
        if (seedError) {
          throw describeFailure(`Pack ${manifest!.id} failed to seed its data:\n${seedError}`, electronApp, rendererErrors);
        }
        if (manifest) await waitForPackBackend(electronApp, manifest.id);
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

      // Read after the test rather than during it, so a drop fails the test that caused it. A page that
      // navigated away loses the collector, which is a miss rather than a false alarm.
      const dropped: string[] = await page.evaluate(() => (window as any).__droppedSends ?? []).catch(() => []);
      if (dropped.length > 0) {
        throw describeFailure(
          `The bus dropped ${dropped.length} send(s) to plugins during this test:\n  ${[...new Set(dropped)].join('\n  ')}`,
          electronApp,
          rendererErrors,
        );
      }
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
          const id0 = await resolvePlugin(page, pluginId);
          await page.evaluate((id) => {
            (window as any).applicationState.send({ type: 'SELECT_PLUGIN', pluginId: id });
          }, id0);
          await page.waitForFunction((id) => {
            const snap = (window as any).applicationState?.getSnapshot();
            if (snap?.context?.activePlugin?.id !== id) return false;
            // The state switching is not the canvas being on screen: Vue renders on the next flush, and a
            // test that clicks or screenshots straight after a navigate needs that flush to have happened.
            // data-active-plugin (WebApp.vue) is written in the flush that swaps the canvas.
            return document.querySelector(`[data-active-plugin="${id}"]`) !== null;
          }, id0, { timeout: 10_000 });
        },

        waitForPlugin: async (pluginId, timeout = 30_000) => {
          // A host plugin is known once the app has any; a pack's registers later, at its address
          await page.waitForFunction(() => ((window as any).applicationState?.getSnapshot()?.context?.plugins ?? []).length > 0, null, { timeout });
          const id = await resolvePlugin(page, pluginId);
          await page.waitForFunction((target) =>
            ((window as any).applicationState?.getSnapshot()?.context?.plugins ?? []).some((p: { id: string }) => p.id === target), id, { timeout });
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

// Direct exports — the app comes from `abuddy test` (ABUDDY_APP_EXECUTABLE / ABUDDY_ROOT) or the enclosing monorepo
const _default = createTest();
export const test = _default.test;
