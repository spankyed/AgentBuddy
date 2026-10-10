import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from './build';
import { findPackRootOrNone, readManifest } from '../utils';
import { publishSession, readDevToolsPort, readSession, startedByFromEnv, type DevSession } from '@abuddy/host/dev-session';
import { findFEEntry, packDevServerConfig } from '../build/fe-bundler';
import { reloadPack, type AppPlace, type DevReload } from '../build/dev-reload.ts';
import { cliDirs, parseAppFlags, resolveLaunchApp, type AppTarget } from '../app/app-target';
import { profileFor, parseProfileFlags, removeProfile, PROFILE_USAGE } from '../app/profiles';
import { copySecretsInto } from '../app/profile-secrets.ts';
import { resolveAppContext } from '@abuddy/sdk/env';
import { errorMessage } from '@abuddy/sdk/utils/pure';
import type { AppEnv } from '@abuddy/sdk/env';
import { readApiEndpoint, lockIsHeld } from '@abuddy/host/process-liveness';
import { withoutSourceCondition } from '@abuddy/host/build/source-resolution';
import { installPackFromLocal, readHostInfo } from '@abuddy/host/packs';
import { removeDevServerMarker, writeDevServerMarker } from '@abuddy/host/packs/dev-server';

const HELP = `
Usage: abuddy dev [--app-root <path> | --app beta]

Launch AgentBuddy and hold it. With a pack in hand it is installed and kept in step with your
edits: FE changes reload the window through Vite, BE changes rebuild, reinstall and reload in
place. Run from a checkout with no pack above it, it launches the app and holds it, and that
is all — no build, no install, no watcher and no dev server.

A development app is launched with a debug port and publishes <dataDir>/session.json, which is
what lets \`abuddy drive\` ask it questions instead of launching one of its own.

An app already running on the same data dir is used as it is; otherwise one is launched, and
closing this command closes the app it started.

Options:
  --app-root <path>   a local AgentBuddy checkout (installed and built)
  --app beta          the newest AgentBuddy Beta build that satisfies the pack's hostVersion
${PROFILE_USAGE}
  --help, -h          Show this help

With no app named: the AgentBuddy checkout this pack is built against, if there is one, else the newest
Beta build its hostVersion accepts. Nothing is remembered and nothing is asked.
With no profile named, the shared development data dir is used.

Note that --app beta reloads by restarting rather than in place: a packaged build refuses a
pack reload, and publishes no API token for one.
`.trim();

/**
 * Which environment an app target runs as. A packaged build stamps its own channel at build time
 * (`_inferElectronAppEnv`), so this reports what the app will decide rather than deciding it: passing
 * ABUDDY_ENV to a beta binary would change nothing.
 */
export function appEnv(app: AppTarget): AppEnv {
  return app.kind === 'source' ? 'development' : 'beta';
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
    // Set only for a profile, and deliberately: it is also what tells Electron the run was pointed at
    // its own dir, which moves the logs inside it (`main/src/app-context.ts`). A plain `abuddy run` should
    // keep writing to the platform log dir, and should keep honouring an ABUDDY_USER_DATA_DIR the caller
    // exported, which naming one here would override.
    out.ABUDDY_USER_DATA_DIR = place.userDataDir;
    // A profile holds its own keys, so the data key goes beside them rather than into the OS keychain,
    // where every profile of one channel would share a service name. The app reads this in any
    // environment but production.
    out.ABUDDY_SECRETS_VAULT = 'file';
  }
  return out;
}

/**
 * The debug port, or nothing — the one gate between this design and an open port on a user's app.
 *
 * **It is computed from the resolved environment and from nothing else.** Not an argv flag anyone can pass,
 * not a session file's contents, not a variable: `development` only, so a `test` context (every `abuddy
 * test` run) and a packaged build a user installed never get one. `--remote-debugging-port` is
 * unauthenticated control of the renderer, and the renderer holds the app's API token, so the gate is the
 * load-bearing part rather than a precaution. Chromium binds it to loopback by default and nothing here
 * widens that.
 *
 * `0` means Chromium picks a free port, which is the only safe way to ask: a fixed one collides with
 * whatever else holds it and with a second app. It then writes the number it picked into the data dir,
 * which `readDevToolsPort` reads.
 */
export function debugPortArgs(place: AppPlace): string[] {
  return resolveAppContext(place).env === 'development' ? ['--remote-debugging-port=0'] : [];
}

/** Starts the app. A checkout runs its own sources with its own electron, so a pack needs none installed. */
function launchApp(app: AppTarget, place: AppPlace): ChildProcess {
  const options = { env: appLaunchEnv(place), stdio: 'ignore' as const, detached: false };
  const debug = debugPortArgs(place);
  if (app.kind === 'source') {
    const electron = createRequire(path.join(app.root, 'package.json'))('electron') as string;
    return spawn(electron, [app.root, ...debug], { ...options, cwd: app.root });
  }
  return spawn(app.executable, debug, options);
}

/**
 * Whether this command may take the data dir from the app that holds it.
 *
 * **Only what a tool started for itself.** `startedBy` is the whole of the rule: a person's app is not a
 * tool's to take, and an absent or unreadable session is not an app at all (`readSession` already treats a
 * record whose supervisor has gone as absent). It is a function so the rule has a firing case on both
 * sides — reclaiming unconditionally takes an app somebody opened, which is the mutation that must fail.
 */
export function mayReclaim(session: DevSession | undefined): boolean {
  return session?.startedBy === 'drive';
}

/**
 * Ends a supervisor whose pid came out of a session file, and waits for the data dir to be free.
 *
 * SIGTERM rather than SIGKILL: the supervisor's own handler closes the app it holds and lets LMDB shut down,
 * where a kill would leave the store to recover. What is waited for is the **app** going, not the signal
 * being delivered — the API's port file is what says the data dir is still held, and starting a second
 * Electron before it clears is the whole failure this exists to prevent.
 */
async function endSupervisor(pid: number, timeoutMs = 20_000): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already gone between reading the file and signalling it, which is a miss rather than a problem
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!lockIsHeld(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The app a question started (pid ${pid}) did not exit within ${Math.round(timeoutMs / 1000)}s. Close it and try again.`);
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

export async function dev(args: string[]) {
  const hooks: SessionHooks = {};
  try {
    await session(args, hooks);
  } catch (error) {
    // The signals have their own handlers; this is every other way a session ends, and it is the one
    // that happens while developing — a pack that fails to build used to exit through the CLI's error
    // handler and leave an ephemeral profile behind
    await hooks.teardown?.();
    throw error;
  }
}

async function session(args: string[], hooks: SessionHooks) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  /**
   * **The pack is optional, and that is the whole of what `dev` does without one.**
   *
   * A checkout with no `abuddy.json` above it is a first-class case rather than an error: it is how this
   * repo drives its own app, and refusing it would leave the app most often looked at the one command that
   * cannot hold it. With no pack there is nothing to build, install, watch or serve, so what is left is the
   * launch, the session file and the hold — and every pack-shaped step below hangs off `pack` being there.
   *
   * `src/` is required only when there is something to watch: a pack without it cannot be developed, where
   * a checkout without one is not a pack at all.
   */
  const root = findPackRootOrNone(process.cwd());
  const pack = root === undefined ? undefined : {
    root,
    srcDir: path.join(root, 'src'),
    manifest: readManifest(root),
    feEntry: findFEEntry(root),
  };
  if (pack && !fs.existsSync(pack.srcDir)) {
    throw new Error('No src/ directory to watch');
  }

  const { mode, withSecrets, rest } = parseProfileFlags(args);
  const flags = parseAppFlags(rest);
  // `run` forwards nothing, so a leftover flag is a typo rather than an argument for something else —
  // where `drive` hands its own leftovers to Playwright and must not refuse them. Ignoring one silently
  // is how a removed or misspelled flag reads as having been obeyed.
  const unknown = flags.args.filter(arg => arg.startsWith('-'));
  if (unknown.length > 0) {
    throw new Error(`Unknown option${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. See abuddy dev --help.`);
  }
  const app = await resolveLaunchApp({ flags, hostVersion: pack?.manifest.hostVersion ?? '*', from: pack?.root ?? process.cwd() });
  const env = appEnv(app);
  const profile = profileFor(mode, cliDirs());
  if (profile?.created && withSecrets) {
    const { count, from } = copySecretsInto(profile, env);
    console.log(`Copied ${count} secret${count === 1 ? '' : 's'} from ${from}`);
  }
  const place: AppPlace = { env, userDataDir: profile?.dir };
  const { userDataDir, apiPortFile } = resolveAppContext(place);

  // Registered here rather than once the dev server is up, because the ten seconds before that — the
  // build, the launch, the install — are exactly when someone presses Ctrl-C, and an ephemeral profile
  // interrupted there used to be left on disk. `child` and `server` are filled in as they come.
  let child: ChildProcess | undefined;
  let server: { close: () => unknown } | undefined;
  let markerFor: string | undefined;

  /**
   * Publishes `<dataDir>/session.json`, so something can attach to the app this command holds.
   *
   * **The pid is this process's**, not the app's: this is the supervisor, and signalling it runs the
   * teardown below, which closes the app it holds — one signal ends both. Nothing goes the other way, so a
   * record naming the app would free the data dir and leave this process, its watcher and its dev server
   * running with nothing to serve.
   *
   * A launch with no debug port publishes nothing. That is the honest answer rather than a record with a
   * hole in it: the file means "attachable", and a `test` or packaged context is not.
   */
  let unpublish: (() => void) | undefined;
  async function publish(spawned: ChildProcess): Promise<void> {
    if (debugPortArgs(place).length === 0) return;
    try {
      const debugPort = await readDevToolsPort(userDataDir);
      unpublish = publishSession({
        debugPort,
        apiPort: readApiEndpoint(apiPortFile)?.port,
        dataDir: userDataDir,
        supervisorPid: process.pid,
        startedBy: startedByFromEnv(),
      });
      console.log(`  attachable on debug port ${debugPort} — \`abuddy drive\` can reach it\n`);
    } catch (error) {
      // A port that never appeared leaves the app perfectly usable and only un-drivable, so this is a
      // warning rather than a failed launch: whoever wanted to watch the app still has it
      void spawned;
      console.warn(`  not attachable: ${errorMessage(error)}\n`);
    }
  }

  // One-shot: `teardown` calls this and then exits, which fires the `exit` handler and would otherwise
  // close the Vite server and remove the marker a second time
  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (markerFor !== undefined) removeDevServerMarker(userDataDir, markerFor);
    // Before the app goes: a session file naming a dead supervisor is a miss rather than a lie, but
    // leaving one is leaving a record of something that is not there
    unpublish?.();
    server?.close();
    // Only one this command launched: an app that was already up outlives it
    child?.kill();
  }

  /**
   * Everything the `exit` handler cannot do, because that one has to be synchronous: removing an
   * ephemeral profile while the app is still closing pulls LMDB's files and the app's own log dir out
   * from under it — noisy on macOS, and on Windows an EBUSY that leaves the directory half removed. So
   * let the app go first.
   *
   * **Every way this command ends runs it**, which is the part that took two goes to get right. Wiring it
   * to the signals alone left the case that actually happens while developing — a pack that fails to
   * build — exiting through the CLI's own error handler and leaking the directory. A SIGKILL still
   * leaks one, which is why an ephemeral dir carries the pid that made it and
   * `abuddy profiles rm --leaked` can reclaim it.
   */
  let tornDown = false;
  async function teardown(): Promise<void> {
    if (tornDown) return;
    tornDown = true;
    cleanup();
    if (child) await exited(child, 10_000);
    if (profile?.ephemeral) {
      removeProfile(cliDirs(), profile.dir);
      console.log(`\nRemoved the ephemeral profile ${profile.name}.`);
    }
  }

  hooks.teardown = teardown;
  process.on('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void teardown().then(() => process.exit(0)));
  }

  if (profile) {
    console.log(`Profile ${profile.name}${profile.ephemeral ? ' (removed on exit)' : ''}`);
    console.log(`  ${profile.dir}`);
    console.log(`  abuddy db --data-dir "${profile.dir}" to read it\n`);
  }

  if (pack) {
    // The build and the app both read the @abuddy packages' dist; from a checkout that dist is built on demand
    ensureCheckoutPackages(pack.root);

    console.log('Running initial build...\n');
    await build([]);
  }

  /**
   * **Reclaiming an app a tool started, which is what makes `--spawn` safe to point at this data dir.**
   *
   * One app per data dir, and `SingleInstanceApp` exits on the second — so without this a spawned one-shot
   * would hold the development dir and the developer's own `abuddy dev` or `npm start` would refuse, with the
   * blame landing on the command they just ran. The rule is narrow by construction: it takes what a tool
   * started *for itself* (`startedBy: 'drive'`) and nothing else, because a person's app is not a tool's to
   * take. The pid comes from a file the process wrote about itself, which is the only kind of kill allowed
   * here, and it is the supervisor's — its own teardown closes the app it holds, so one signal ends both.
   *
   * After it, the two commands converge rather than compete: the next question attaches to the app the
   * developer now has.
   */
  const reclaimable = readSession(userDataDir);
  if (mayReclaim(reclaimable)) {
    console.log(`Reclaiming the app a question started (pid ${reclaimable!.supervisorPid})...`);
    await endSupervisor(reclaimable!.supervisorPid);
    console.log('  it has gone; starting yours\n');
  }

  // An app already on this data dir is the one to use: a second Electron over the same LMDB store is not a
  // choice anyone wants. Only an app this command started is one it may close.
  if (readApiEndpoint(apiPortFile)) {
    console.log(`Using the ${env} app already running.\n`);
  } else {
    console.log(`Starting ${app.kind === 'source' ? app.root : `AgentBuddy Beta ${app.version}`}...`);
    child = launchApp(app, place);
    await waitForApi(apiPortFile, child);
    console.log(`  up on ${env} data in ${userDataDir}\n`);
    // Published only for an app this command started, and after its API is up so the session carries the
    // port a driver needs. An app that was already here has a session of its own or is not attachable, and
    // either way is not this command's to describe.
    await publish(child);
  }

  if (!pack) {
    // The launch and the hold, which is all there is without a pack. Returning here is what makes every
    // step below — install, dev server, watchers, reload — a pack's rather than the command's.
    console.log('No pack here: holding the app. Ctrl-C to close it.\n');
    await new Promise(() => {});
    return;
  }

  // After the app has started, so `readHostInfo` reads what this app records rather than a previous one's
  console.log(`Installing pack to the ${env} app...`);
  const result = await installToApp(pack.root, place);
  console.log(`  ${result.dir}\n`);

  if (!pack.feEntry) {
    console.log('No FE entry found. Falling back to watch + rebuild + reload mode.\n');
    await watchRebuildFallback(pack.root, pack.srcDir, pack.manifest.id, place);
    return;
  }

  const vite = await import('vite');
  server = await vite.createServer(await packDevServerConfig(pack.root, pack.feEntry));

  const devServer = server as import('vite').ViteDevServer;
  await devServer.listen();
  const address = devServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  if (!port) {
    throw new Error('Vite dev server failed to bind a port');
  }

  // Outside the installed pack: its directory is the verified pack, replaced by every install below
  writeDevServerMarker(userDataDir, pack.manifest.id, { port, pid: process.pid });
  markerFor = pack.manifest.id;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  fs.watch(path.join(pack.root, 'abuddy.json'), () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log('\nabuddy.json changed — regenerating entries...');
      try {
        const { generateEntries } = await import('./generate-entries');
        await generateEntries(['--force'], pack.root);
      } catch (err) {
        console.error(`Regeneration failed: ${err instanceof Error ? err.message : err}`);
      }
    }, 300);
  });

  // BE file watcher: rebuild → install → hot-reload backend
  let beDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let beReloading = false;
  fs.watch(pack.srcDir, { recursive: true }, (_eventType, filename) => {
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
        await installToApp(pack.root, place);
        console.log('Triggering BE reload...');
        reportReload(await reloadPack(pack.manifest.id, place), 'BE changes');
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
