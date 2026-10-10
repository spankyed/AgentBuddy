import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { replaceDir, stagingDirName } from '@abuddy/host/replace-dir';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import semver from 'semver';
import { resolveAppContext } from '@abuddy/sdk/env';
import { findRunningApp } from '@abuddy/host/database';
import { downloadVerified, listAppReleases, type Release } from '../app/app-releases.ts';
import { parseTargetEnv, TARGET_ENV_USAGE } from '../utils.ts';

const execFileAsync = promisify(execFile);

const HELP = `
Usage: abuddy upgrade [-b] [--relaunch] [--force]

Install the latest AgentBuddy release into /Applications, replacing the one that is there.

Options:
  --relaunch   Open the app once it is installed
  --force      Install even when the installed version is already that new
  ${TARGET_ENV_USAGE}
`.trim();

/** Product names from electron-builder.mjs; the release artifacts use them with spaces removed */
const PRODUCT_NAMES = { production: 'AgentBuddy', beta: 'AgentBuddy Beta' } as const;
type Channel = keyof typeof PRODUCT_NAMES;

const APPLICATIONS = '/Applications';

/** The release this channel wants, and the two assets it needs, or why there is none */
export interface AppRelease {
  version: string;
  zip: Release['assets'][number];
  checksum: Release['assets'][number];
}

/**
 * The newest release for `channel` that ships a zip and its sha256.
 *
 * **The zip, not the dmg**, though a release publishes both: the app is installed by expanding it with
 * `ditto`, which keeps the bundle's symlinks, permissions and code signature — where mounting a dmg and
 * copying the bundle out of it preserves none of those reliably.
 *
 * A release missing either asset is skipped rather than failed, because a build that published only some of
 * its artifacts should not stop an upgrade to the one before it.
 */
export function pickAppRelease(releases: Release[], channel: Channel): AppRelease | null {
  const prefix = PRODUCT_NAMES[channel].replace(/ /g, '-');
  const zipPattern = new RegExp(`^${prefix}-(.+)-mac-arm64\\.zip$`);

  const candidates = releases
    .filter(r => !r.draft && Boolean(r.prerelease) === (channel === 'beta'))
    .map(r => ({ release: r, version: semver.valid(r.tag_name.replace(/^v/, '')) }))
    .filter((c): c is { release: Release; version: string } => c.version !== null)
    .sort((a, b) => semver.rcompare(a.version, b.version));

  for (const { release } of candidates) {
    // **The captured group must itself be a version**, which is what keeps the channels apart: the
    // production prefix is a prefix of the beta one, so `^AgentBuddy-(.+)-…` matches
    // `AgentBuddy-Beta-0.4.1-mac-arm64.zip` with `Beta-0.4.1` captured. Taking the tag's version when the
    // capture does not parse would install the Beta build as production.
    const zip = release.assets.find(a => semver.valid(a.name.match(zipPattern)?.[1] ?? '') !== null);
    const checksum = zip && release.assets.find(a => a.name === `${zip.name}.sha256`);
    if (!zip || !checksum) continue;
    // The app's own version, which for a beta promoted from a production build is not the tag's
    return { version: semver.valid(zip.name.match(zipPattern)![1])!, zip, checksum };
  }
  return null;
}

/** What is installed at `appPath` now, or nothing when it is not there or says no version */
export function installedVersion(appPath: string): string | null {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(plist)) return null;
  try {
    const raw = execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', plist], { encoding: 'utf8' });
    return semver.valid(raw.trim());
  } catch {
    return null;
  }
}

/**
 * Asks the app to quit and waits until it says it has, or explains why it did not.
 *
 * **Asked, never killed.** `quit app` is an Apple Event, so the app runs its own shutdown — closing the
 * database cleanly and removing the `app.lock` that records it as running. A signal would skip all of that,
 * and matching a process by name to find something to signal is how the wrong process gets killed.
 *
 * What it waits on is that lock rather than a sleep: the app removes it on `will-quit`, so its absence is
 * the app's own statement that it is done, and `findRunningApp` is the reader that already knows where it
 * lives. A run that times out refuses instead of escalating — replacing a bundle under a live process is
 * the thing being avoided, so doing it anyway would defeat the wait.
 */
async function quitApp(product: string, channel: Channel, log: (message: string) => void): Promise<void> {
  const context = resolveAppContext({ env: channel });
  const running = () => findRunningApp({ userDataDir: context.userDataDir, apiPortFile: context.apiPortFile });
  if (!running()) return;

  log(`Quitting ${product}...`);
  try {
    await execFileAsync('osascript', ['-e', `quit app "${product}"`]);
  } catch {
    // Not running under Launch Services' name, or it refused the event; the wait below reports either
  }

  for (let waited = 0; waited < 20_000; waited += 250) {
    if (!running()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${product} is still running after being asked to quit. Quit it and run this again — upgrading underneath a running app would leave it on a bundle that no longer exists.`);
}

export async function upgrade(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const { env, args: rest } = parseTargetEnv(args);
  if (env !== 'production' && env !== 'beta') {
    throw new Error('There is no installed dev app to upgrade. Run `npm start` in the AgentBuddy repo instead.');
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`AgentBuddy is published for macOS on Apple Silicon only (current platform: ${process.platform}/${process.arch}).`);
  }

  const relaunch = rest.includes('--relaunch');
  const force = rest.includes('--force');
  const product = PRODUCT_NAMES[env];
  const appPath = path.join(APPLICATIONS, `${product}.app`);

  console.log(`Looking for the latest ${product} release...`);
  const release = pickAppRelease(await listAppReleases(), env);
  if (!release) {
    throw new Error(`No ${product} release publishes a mac-arm64 zip with its sha256.`);
  }

  const have = installedVersion(appPath);
  if (have && !force && semver.gte(have, release.version)) {
    console.log(`${product} ${have} is already installed, and ${release.version} is the newest published. Use --force to install it anyway.`);
    return;
  }
  console.log(have ? `Upgrading ${product} ${have} -> ${release.version}` : `Installing ${product} ${release.version}`);

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-upgrade-'));
  try {
    const zipPath = path.join(staging, release.zip.name);
    console.log(`Downloading ${release.zip.name}...`);
    await downloadVerified({ asset: release.zip, checksum: release.checksum, to: zipPath });

    // Expanded before the running app is touched, so a bad archive costs nothing but the download
    const expanded = path.join(staging, 'app');
    await execFileAsync('ditto', ['-x', '-k', zipPath, expanded]);
    const incoming = path.join(expanded, `${product}.app`);
    if (!fs.existsSync(incoming)) {
      throw new Error(`${release.zip.name} does not contain ${product}.app`);
    }

    await quitApp(product, env, console.log);

    /**
     * Copied in beside the installed app, then renamed over it — `replaceDir`, the same swap `placePack` and
     * every derived-tree build take, so the restore on a failed install is one implementation rather than
     * this one's own.
     *
     * The copy is first because `ditto` is how a `.app` crosses from the download staging directory, which is
     * on whatever filesystem the temp dir is: a rename out of there fails with `EXDEV`. `stagingDirName` names
     * the destination, which is what makes the pid in it safe — a recycled pid matching a leftover from a
     * crashed upgrade had this renaming the app onto a directory that already existed, and a rename onto an
     * existing directory "either throws or replaces depending on the platform and whether it is empty, and
     * neither is an answer to 'rename this'" (`src/app/profiles.ts`).
     */
    const staged = path.join(path.dirname(appPath), stagingDirName(path.basename(appPath), 'installing'));
    await execFileAsync('ditto', [incoming, staged]);
    replaceDir(staged, appPath);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  console.log(`${product} ${release.version} installed.`);
  if (relaunch) {
    execFileSync('open', ['-a', product], { stdio: 'pipe' });
    console.log(`Opened ${product}`);
  }
}
