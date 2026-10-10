import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import { refusePackRuleViolations } from '../build/pack-rules.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appLabel, parseAppFlags, resolvePinnedApp, type AppTarget } from '../app/app-target';
import { resolvePlaywrightCli } from '../app/playwright';
import { withoutSourceCondition } from '@abuddy/host/build/source-resolution';
import { cliBin, readManifest, resolveVitestCli } from '../utils';
import { VITEST_CONFIG_FILES } from './init.ts';

export const TEST_USAGE = `Usage: abuddy test [--build <name|path>] [--release] [--prebuilt] [playwright args...]
       abuddy test --contract [vitest args...]

Runs the pack's Playwright tests in AgentBuddy. The build is, in order: --build (a name, or a
local AgentBuddy checkout by path), ABUDDY_BUILD, or the newest AgentBuddy Beta satisfying the
pack's hostVersion, downloaded and cached. It reads no machine state and derives nothing from where
the pack sits, so a run means the same thing on any machine.

--prebuilt installs the build already in dist/ instead of making a new one, for a caller that built the
pack in an earlier step. The build is still held to being no older than the sources, so a stale one fails
rather than being tested quietly.

--release builds the pack the way a release does, so the tests run the artifact that ships.
\`abuddy release\` passes it; on its own the default build is the faster one to debug.

--contract runs the pack's vitest instead, and starts no app: the checks that read compiled
output, generated types and the harness. Nothing to download, nothing to build but the pack.`;

/**
 * Env the @abuddy/testing fixture reads to launch the app and install the pack. The runner gets
 * the @abuddy/source condition only when @abuddy/testing is a checkout's source.
 */
export function fixtureEnv(
  app: AppTarget,
  packDir: string | undefined,
  base: NodeJS.ProcessEnv,
  options: { release?: boolean; prebuilt?: boolean; keepSourceCondition?: boolean } = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  // A pack resolves the packages' published dist, whoever runs it: the condition never reaches this run,
  // even when the caller had it (npm test in a checkout).
  //
  // **`keepSourceCondition` is for a run with no pack in it** — `abuddy drive` driving the app itself from
  // a checkout, which is what this repo's `npm run drive` does. There is no pack to resolve `dist` for, the
  // subject is the checkout's own source, and stripping the condition would change what that run loads.
  const nodeOptions = options.keepSourceCondition === true ? base.NODE_OPTIONS : withoutSourceCondition(base.NODE_OPTIONS);
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;
  delete env.ABUDDY_ROOT;
  // ELECTRON_RUN_AS_NODE (app-bundled launcher) stays: the runner and its workers run on
  // process.execPath. The fixture drops it for the app it launches (appLaunchEnv).
  delete env.ABUDDY_APP_EXECUTABLE;
  // ABUDDY_BUILD as well as the executable: the fixture builds the pack, and resolving its dependencies
  // on built-in packs reads the app choice, not the launch target. Without it a `--app beta` run
  // resolves against the checkout behind the pack, or finds nothing at all in CI.
  delete env.ABUDDY_BUILD;
  // Where the app's data goes, and where its screenshots and reports land, is this run's to decide and
  // never the shell's. All three are read straight from the environment by the fixture, because the `test`
  // a spec imports is built at module scope and no option can reach it — so an exported E2E_DATA_DIR would
  // have a pinned run use a directory it did not make, and leave it behind. `abuddy drive` sets them after
  // calling this.
  delete env.E2E_DATA_DIR;
  delete env.E2E_SCREENSHOT_DIR;
  delete env.E2E_REPORT_DIR;
  if (app.kind === 'source') env.ABUDDY_ROOT = app.root;
  else {
    env.ABUDDY_APP_EXECUTABLE = app.executable;
    env.ABUDDY_BUILD = 'beta';
  }
  // Cleared when there is none, as ABUDDY_PACK_RELEASE below is: `abuddy test` runs the pack it is in,
  // so an exported PACK_DIR in a directory that holds no manifest would have it build and install a
  // pack the caller never named. `tests/scripts/test-packaged-authoring.sh` used to `unset` it by hand
  if (packDir) env.PACK_DIR = packDir;
  else delete env.PACK_DIR;
  if (options.release) env.ABUDDY_PACK_RELEASE = '1';
  else delete env.ABUDDY_PACK_RELEASE;
  if (options.prebuilt) env.ABUDDY_PACK_PREBUILT = '1';
  else delete env.ABUDDY_PACK_PREBUILT;
  // The fixture builds the pack with this same CLI
  env.ABUDDY_CLI = cliBin();
  return env;
}

/**
 * The pack's own vitest, with no app. A pack author can check compiled output, generated types and the
 * harness specs without an AgentBuddy to run them in — which is the same split the repo's own chain makes
 * between its contract tier and its app tier, offered to packs rather than kept for this repo.
 */
/** Where a pack keeps its tests: what `abuddy init-tests` scaffolds, and what the harness docs describe */
const TEST_DIRS = ['tests'];

export interface ContractRunner {
  /** Returns the runner's exit status; `null` means it did not exit normally */
  (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }): number | null;
}

const spawnContract: ContractRunner = (command, args, options) =>
  spawnSync(command, [...args], { ...options, stdio: 'inherit' }).status;

export async function contractTest(cwd: string, args: string[], run: ContractRunner = spawnContract): Promise<void> {
  if (!VITEST_CONFIG_FILES.some((file) => fs.existsSync(path.join(cwd, file)))) {
    console.log('No vitest config in this pack, so there are no contract checks to run. `abuddy init-tests` scaffolds one.');
    return;
  }
  // A pack's tests name its modules the way its sources do, and `abuddy build` reads only `src` — so this is
  // where a test file's `#generated/ears` is refused, before a run whose resolution depends on it
  refusePackRuleViolations(cwd, TEST_DIRS);
  // The harness this run loads is built from the checkout's source, so bring it up to date first
  ensureCheckoutPackages(cwd);
  // A pack resolves the packages' published dist, whoever runs it — the same rule the Playwright half
  // follows, and the reason a checkout's own condition must not reach this run
  // **This inherits the environment where `fixtureEnv` scrubs it, and that is deliberate.** No app starts
  // here, so there is no app to pin — and `tests/scripts/test-external-pack-contract.sh` exports
  // `ABUDDY_ROOT` precisely so the pack's build resolves this checkout. Scrubbing it the way the fixture
  // path does would break that step. Nothing on this path reads `E2E_DATA_DIR`, `E2E_SCREENSHOT_DIR` or
  // `PACK_DIR`, which is why the hermeticity those get in `fixtureEnv` is not needed here.
  const env: NodeJS.ProcessEnv = { ...process.env };
  const nodeOptions = withoutSourceCondition(process.env.NODE_OPTIONS);
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;
  env.ABUDDY_CLI = cliBin();

  const status = run(process.execPath, [resolveVitestCli(cwd), 'run', '--root', cwd, ...args], { cwd, env });
  if (status !== 0) throw new Error(`Contract tests failed (vitest exited ${status ?? 'without a status'})`);
}

export async function test(args: string[], run?: ContractRunner): Promise<void> {
  if (args.includes('--help')) {
    console.log(TEST_USAGE);
    return;
  }
  const cwd = process.cwd();

  if (args.includes('--contract')) return contractTest(cwd, args.filter((arg) => arg !== '--contract'), run);

  if (!fs.existsSync(path.join(cwd, 'playwright.config.ts'))) {
    throw new Error('No playwright.config.ts found. Run `abuddy init-tests` first.');
  }

  const manifest = fs.existsSync(path.join(cwd, 'abuddy.json')) ? readManifest(cwd) : undefined;

  const flags = parseAppFlags(args);
  const playwrightCli = resolvePlaywrightCli(cwd);
  const app = await resolvePinnedApp({ flags, hostVersion: manifest?.hostVersion ?? '*' });

  refusePackRuleViolations(cwd, TEST_DIRS);
  // The harness bundle this run loads is built from the checkout's source, so bring it up to date first
  ensureCheckoutPackages(cwd);

  console.log(`Testing in ${appLabel(app)}`);
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...flags.args], {
    cwd,
    env: fixtureEnv(app, manifest ? cwd : undefined, process.env, { release: flags.release, prebuilt: flags.prebuilt }),
    stdio: 'inherit',
  });
  // Thrown, not exited: `abuddy release` calls this, and an exit here skipped the message telling the
  // author their version files are already bumped. The CLI's dispatcher prints the message and exits 1.
  if (result.status !== 0) throw new Error(`E2E tests failed (Playwright exited ${result.status ?? 'without a status'})`);
}
