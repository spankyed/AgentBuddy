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
import { appLaunchEnv, pinsViewport } from './launch-env.ts';
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
  // A caller that is not a test says where its own output goes. The fallbacks below assume the caller is
  // a suite — written when it always was — so `abuddy drive` landed its screenshots under `tests/`,
  // which is the one place the command exists to keep driving out of. Same reason `E2E_DATA_DIR` exists:
  // the `screenshotDir` option cannot reach the `test` every script imports, built here with no options
  if (process.env.E2E_SCREENSHOT_DIR) return path.resolve(process.env.E2E_SCREENSHOT_DIR);
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
    // The ids the plugins run under: a plugin runs at `<packId>/<featureId>`, as a system does
    pluginIds: (manifest.features ?? [])
      .filter((f: any) => f.plugin)
      .map((f: any) => resolveName(f.id, manifest.id)),
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
/** Where this app's output is being written, so a failure can name it instead of asking for a re-run */
const appLogs = new WeakMap<ElectronApplication, string>();

/** What the pack loader said about the pack under test, kept whole while the tail scrolls past it. */
type PackLoad = { registered?: true; failure?: string };
const packLoads = new WeakMap<ElectronApplication, PackLoad>();

/**
 * The app's own output, where whoever ran the suite can read it after the fact.
 *
 * The tail below is a ring buffer the fixture reports on its own failures, and `DEBUG_E2E=1` prints
 * everything to the terminal — neither is reachable once a run is over, which is what made
 * "re-run under DEBUG_E2E" the standard next step. Electron's own logs are no better: a run given its own
 * data dir keeps them there (`packages/main/src/app-context.ts`), and an ephemeral drive session deletes
 * that dir on the way out, taking them with it.
 *
 * Playwright's `outputDir` is the one place that outlives the app and not the run: it is wiped at the start
 * of every run, so this is always exactly the last run and never an archive nobody prunes. Named per worker
 * because the app is worker-scoped — two workers' output in one file interleaves into neither's.
 */
function appLogPath(info: { project: { outputDir: string }; workerIndex: number }): string {
  return path.join(info.project.outputDir, `app-${info.workerIndex}.log`);
}

function captureOutput(app: ElectronApplication, logFile?: string): void {
  if (logFile) appLogs.set(app, logFile);
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
  // Appended, not buffered to the end: a crash or a hang is exactly when this is wanted, and either one
  // means no later flush arrives. `mkdirSync` because Playwright creates `outputDir` lazily, so the first
  // chunk can beat it.
  if (logFile) fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const onData = (data: Buffer) => {
    if (logFile) { try { fs.appendFileSync(logFile, data); } catch { /* a log is never worth failing a run */ } }
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
/**
 * The ref a spec's plugin name is, as the pack under test's own code names plugins: its features by id, any
 * other (the host's too) as `<packId>/<featureId>`.
 */
function resolvePlugin(name: string): string {
  return resolveName(name, getPackManifest()?.id);
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
  const logFile = appLogs.get(app);
  sections.push(logFile
    ? `Full Electron and API output: ${logFile}`
    : 'Re-run with DEBUG_E2E=1 for full Electron output.');
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
    // Playwright's signature for a fixture that depends on no other fixture. It always passes an object, and
    // dropping the parameter would change the fixture's arity.
    // eslint-disable-next-line no-empty-pattern
    electronApp: [async ({}, use, workerInfo) => {
      // From a checkout this fixture is built on demand, and a stale build tests the previous app
      assertCheckoutPackagesFresh();
      // Every worker gets a fresh data dir: no data, installed packs or onboarding state leak
      // between runs or from other packs, and nothing touches the developer's abuddy-test dir
      // E2E_DATA_DIR overrides that with one the caller owns and keeps, which is how `abuddy drive`
      // runs against an instance whose state survives the session. An environment variable rather than a
      // `createTest` option because the `test` every spec imports is built at module scope with no
      // options, so an option could never reach it.
      const givenDataDir = process.env.E2E_DATA_DIR;
      const userDataDir = givenDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-e2e-'));
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
          // `hostVersion` is the launched app's own (its package.json), so this is that app's answer rather than a
          // second opinion. No `packFormat`: whether this app can read the pack's build is the app's to decide, and
          // it does, at boot, naming which side is older. Nothing here can tell — the CLI that runs the fixture
          // needn't be the app's, and inferring the app's format from an artifact it ships refuses good packs
          // whenever that artifact is the stale one. `waitForPackBackend` reports the app's verdict within 15s.
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
        captureOutput(app, appLogPath(workerInfo));
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
        // A dir the caller gave is the caller's to remove; this owns only the one it made
        if (givenDataDir !== undefined) {
          console.log(`[e2e] left the data dir it was given: ${userDataDir}`);
        } else if (process.env.E2E_KEEP_DATA) {
          console.log(`[e2e] kept test data dir: ${userDataDir}`);
        } else {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        }
      }
    }, { scope: 'worker' }],

    appPage: async ({ electronApp }, use) => {
      const page = await findMainWindow(electronApp);
      // Deterministic for a suite, and the window's own size for a run someone is watching — see `pinsViewport`
      if (pinsViewport(process.env)) await page.setViewportSize(E2E_VIEWPORT);

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
       * counterpart for a running app.
       */
      await page.evaluate(() => {
        const win = window as any;
        if (win.__droppedSends) return;
        win.__droppedSends = [];
        win.applicationState?.system?.inspect?.((inspection: any) => {
          const event = inspection?.event;
          if (inspection?.type !== '@xstate.event' || event?.type !== 'SYSTEM_ERROR') return;
          if (event.operation === 'broadcastToPlugin') win.__droppedSends.push(String(event.message ?? ''));
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
          // Made on first use, not at fixture setup: every run of every spec used to leave an empty
          // `tests/screenshots/` behind, including suites that screenshot nothing
          fs.mkdirSync(screenshotDir, { recursive: true });
          const filePath = path.join(screenshotDir, `${name}.png`);
          return page.screenshot({ path: filePath });
        },

        navigate: async (pluginId) => {
          const id0 = resolvePlugin(pluginId);
          await page.evaluate((id) => {
            (window as any).applicationState.send({ type: 'SELECT_PLUGIN', plugin: id });
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
          // A host plugin is known once the app has any; a pack's registers later, at its ref
          await page.waitForFunction(() => ((window as any).applicationState?.getSnapshot()?.context?.plugins ?? []).length > 0, null, { timeout });
          const id = resolvePlugin(pluginId);
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

/**
 * The same runner under a name that says what a driving script is, for `abuddy drive`. A driving script
 * asserts nothing and nothing gates on it, so calling it `test` was the whole confusion; Playwright
 * discovers work from the calls made at import rather than from the binding's name, so the alias costs
 * nothing and reporters and `--grep` still match titles.
 */
export const drive = _default.test;

/**
 * A driving session something outside the process can talk to, for `abuddy drive --serve`.
 *
 * Re-exported here rather than from an entry of its own: a driving script already imports `drive` from
 * this module, and the engine is the same job done interactively, so a second entry would be a second
 * name for one thing. `src/engine/` has what it does and why.
 */
import { runDriveEngine, type EngineWindow, type ExtraVerbs } from './engine/index.ts';

export { ENGINE_TOKEN_HEADER, MARKER_FILE, runDriveEngine, type DriveEngineOptions, type EngineMarker, type EngineWindow, type ExtraVerbs, type Verb } from './engine/index.ts';

/**
 * The app's own window, so `/set-viewport` resizes it rather than drawing into a corner of it.
 *
 * `browserWindow(page)` hands back a handle to the `BrowserWindow` in the main process, and `evaluate` runs
 * there — which is the only way to reach it: the renderer cannot resize itself, and the app blocks the
 * navigation that would be the other way to try.
 */
const electronWindow = (electronApp: ElectronApplication, page: Page): EngineWindow => ({
  setContentSize: async (width, height) => {
    const browserWindow = await electronApp.browserWindow(page);
    await browserWindow.evaluate(
      (window: { setContentSize: (width: number, height: number) => void }, size: { width: number; height: number }) =>
        window.setContentSize(size.width, size.height),
      { width, height },
    );
  },
});

/**
 * The body of a serving session: everything `abuddy drive --serve`'s generated script does.
 *
 * **The body rather than the registration, so two things hold at once.** The wiring is typechecked here
 * — the generated script is a string, so an option it had to pass was a chance to drift, and did, once:
 * adding `/wait` added two options the template did not pass, which showed up as
 * `page.waitForState is not a function` against a running app rather than as a compile error. And
 * `drive(...)` is still called from the script, so Playwright reports the session at the caller's file
 * instead of at a line inside this bundle, which is what a reader needs when a run is interrupted.
 *
 * **It takes options and returns the body**, rather than being the body, so the one thing a session file
 * is for — adding verbs of its own — is a typechecked argument at that file. A new option is then a
 * compile error there instead of the failure above.
 */
export const driveEngineBody = (options: { verbs?: ExtraVerbs } = {}) =>
  async (
    { app, appPage, electronApp }: { app: AppHelper; appPage: Page; electronApp: ElectronApplication },
    testInfo: { project: { outputDir: string }; workerIndex: number },
  ): Promise<void> => {
    await runDriveEngine({
      page: appPage,
      app,
      outputDir: testInfo.project.outputDir,
      // The same file the fixture writes the app's output to, so `/logs` answers from the run's own log
      logPath: appLogPath(testInfo),
      verbs: options.verbs,
      // The same question the fixture asked when it decided whether to pin: a window someone can see is
      // resized for real, and one nobody can gets the emulated viewport a suite needs
      window: pinsViewport(process.env) ? undefined : electronWindow(electronApp, appPage),
    });
  };
