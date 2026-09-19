import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { parse, satisfies } from 'semver';
import { discoverBuiltInPacks } from './pack-discovery.ts';
import { stagingDirName } from './staging.ts';
import { DOWNLOAD_TIMEOUT_MS, fetchReleaseAsset, githubFetch, type GitHubReleaseAsset } from './github.ts';
import { resolveAppContext } from '@abuddy/sdk/env';
import { parseManifest } from '@abuddy/sdk/build';
import { createLogger } from '@abuddy/sdk/logger';
import type { PackManifest } from '@abuddy/sdk/build';
import {
  PACK_LAYOUT,
  assertChecksum,
  extractPackArchive,
  hasBuiltPackSections,
  isPackLayout,
  stagePack,
  verifyPack,
  type PackIntegrity,
} from './pack-layout.ts';

// The CLI installs without an app bound: its entries go to the console then
const log = createLogger('pack-installer');

export interface InstallResult {
  id: string;
  name: string;
  version: string;
  dir: string;
  missingDependencies: string[];
  integrity: PackIntegrity;
}

export interface InstallOptions {
  /** Refuse packs whose manifest hostVersion this host doesn't satisfy (the app passes its version). */
  hostVersion?: string;
  /** Expected sha256 of a downloaded archive. */
  sha256?: string;
}

/** Reports a download's failure with its URL: a timeout, a refused connection, a body that stopped mid-way. */
function downloadFailed(url: string) {
  return (err: unknown): never => {
    throw new Error(`Downloading ${url} failed: ${err instanceof Error ? err.message : err}`);
  };
}

function ensurePacksDir(targetDir?: string): string {
  const dir = targetDir ?? resolveAppContext().packsDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function extractZip(zipPath: string, destDir: string): void {
  execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'pipe' });
}

function readValidManifest(dir: string): PackManifest {
  const manifestPath = path.join(dir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('No abuddy.json found in pack source');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    throw new Error('abuddy.json is not valid JSON');
  }

  const { errors } = parseManifest(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid abuddy.json:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
  return raw as PackManifest;
}

/**
 * Whether an app at `appVersion` satisfies a pack's `hostVersion` range.
 *
 * A prerelease counts as its release, the same rule the migrations runner states: `0.3.15-beta.2` runs
 * the `0.3.15` migrations, and here it installs the packs that ask for `>=0.3.15`. Semver orders a
 * prerelease *before* its release, so without this a beta refuses every pack that requires the release
 * it is a beta of — which is the release those packs are being tested against. The trade is the same
 * one migrations already take: a pack asking for `>=0.3.15` installs on an early beta that may not have
 * everything it needs yet.
 */
export function isHostCompatible(hostRange: string | undefined, appVersion: string): boolean {
  if (!hostRange) return true;
  try {
    const parsed = parse(appVersion);
    const asRelease = parsed && parsed.prerelease.length > 0 ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : appVersion;
    return satisfies(asRelease, hostRange, { includePrerelease: true });
  } catch {
    return false;
  }
}

function assertHostCompatible(manifest: PackManifest, hostVersion?: string): void {
  if (!hostVersion || !manifest.hostVersion) return;
  if (!isHostCompatible(manifest.hostVersion, hostVersion)) {
    throw new Error(`Pack ${manifest.id}@${manifest.version} requires AgentBuddy ${manifest.hostVersion}; this is ${hostVersion}`);
  }
}

function findPackRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory() && !e.isSymbolicLink());
  if (dirs.length === 1) {
    const child = path.join(dir, dirs[0].name);
    if (fs.existsSync(path.join(child, 'abuddy.json'))) return child;
  }
  return dir;
}

/** The app data dir's published built-in packs (`<userData>/host-packs`, written at app boot). */
function hostPacksDirFor(packsDir: string): string {
  return path.join(path.dirname(packsDir), 'host-packs');
}

/**
 * Packs the host provides: discovered from BUILT_IN_PACKS_DIR inside the app, otherwise the
 * built-in packs the app published into the data dir next to `packsDir`.
 */
function getBuiltInPackIds(packsDir: string): Set<string> {
  const builtInDir = process.env.BUILT_IN_PACKS_DIR;
  if (builtInDir) return new Set(discoverBuiltInPacks(builtInDir).map(pack => pack.id));
  const hostPacksDir = hostPacksDirFor(packsDir);
  if (!fs.existsSync(hostPacksDir)) return new Set();
  return new Set(
    fs.readdirSync(hostPacksDir, { withFileTypes: true })
      // Hidden dirs are publishes in progress (publishHostPackOutput)
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name),
  );
}

/** Dependencies neither installed in `packsDir` nor built into the host. */
export function checkDependencies(
  manifest: { dependencies?: Record<string, string> },
  packsDir: string,
): string[] {
  const deps = manifest.dependencies ?? {};
  if (Object.keys(deps).length === 0) return [];
  const builtInIds = getBuiltInPackIds(packsDir);
  const missing: string[] = [];
  for (const depId of Object.keys(deps)) {
    if (builtInIds.has(depId)) continue;
    if (!fs.existsSync(path.join(packsDir, depId, 'abuddy.json'))) missing.push(depId);
  }
  return missing;
}

/** Replace <packsDir>/<id> with `sourceDir`'s contents without leaving a half-copied pack behind. */
function placePack(sourceDir: string, packsDir: string, id: string): string {
  const destDir = path.join(packsDir, id);
  const incoming = fs.mkdtempSync(path.join(packsDir, `.${id}.installing-${process.pid}-`));
  try {
    copyDir(sourceDir, incoming);
    const previous = fs.existsSync(destDir) ? path.join(packsDir, stagingDirName(id, 'previous')) : null;
    if (previous) fs.renameSync(destDir, previous);
    try {
      fs.renameSync(incoming, destDir);
    } catch (err) {
      // Put the installed version back rather than leaving the pack missing
      if (previous && !fs.existsSync(destDir)) fs.renameSync(previous, destDir);
      throw err;
    }
    if (previous) fs.rmSync(previous, { recursive: true, force: true });
    return destDir;
  } catch (err) {
    fs.rmSync(incoming, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Install from a directory that is one of:
 * - a pack layout (integrity.json): verified, then copied as-is
 * - a pack source built in that layout (dist/runtime, dist/types): staged first
 */
async function installFromDirectory(dir: string, packsDir: string, options: InstallOptions): Promise<InstallResult> {
  const manifestSource = readValidManifest(dir);
  assertHostCompatible(manifestSource, options.hostVersion);

  let layoutDir = dir;
  let stageRoot: string | undefined;
  if (!isPackLayout(dir) && hasBuiltPackSections(dir)) {
    stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-stage-'));
    layoutDir = path.join(stageRoot, manifestSource.id);
    stagePack(dir, layoutDir);
  }

  try {
    if (!isPackLayout(layoutDir)) {
      throw new Error(`Pack ${manifestSource.id} is not built: ${dir} has no ${PACK_LAYOUT.info} and no dist/${PACK_LAYOUT.runtimeEntry} with dist/${PACK_LAYOUT.snapshot}. Run "abuddy build" first.`);
    }
    const integrity = verifyPack(layoutDir);

    const manifest = readValidManifest(layoutDir);
    const destDir = placePack(layoutDir, packsDir, manifest.id);
    const missingDependencies = checkDependencies(manifest, packsDir);
    log.info(`Installed "${manifest.name}" v${manifest.version} to ${destDir}`);
    return { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir, missingDependencies, integrity };
  } finally {
    if (stageRoot) fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

export async function installPackFromLocal(source: string, targetPacksDir?: string, options: InstallOptions = {}): Promise<InstallResult> {
  const expanded = source.startsWith('~') ? source.replace('~', os.homedir()) : source;
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${resolved}`);
  }

  const packsDir = ensurePacksDir(targetPacksDir);
  if (fs.statSync(resolved).isDirectory()) {
    return installFromDirectory(resolved, packsDir, options);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-install-'));
  try {
    // Every archive is checked before anything is unpacked, whatever its format
    if (options.sha256) assertChecksum(resolved, options.sha256);
    let root: string;
    if (resolved.endsWith('.tgz') || resolved.endsWith('.tar.gz')) {
      root = await extractPackArchive(resolved, tmpDir);
    } else if (resolved.endsWith('.zip')) {
      extractZip(resolved, tmpDir);
      root = findPackRoot(tmpDir);
    } else {
      throw new Error('Source must be a directory, .zip, or .tgz file');
    }
    return await installFromDirectory(root, packsDir, options);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function installPackFromUrl(url: string, targetPacksDir?: string, options: InstallOptions = {}): Promise<InstallResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-install-'));
  try {
    const filename = new URL(url).pathname.split('/').pop() || 'pack.tgz';
    if (!/\.(tgz|tar\.gz|zip)$/.test(filename)) {
      throw new Error('URL must point to a .tgz or .zip file');
    }
    const downloadPath = path.join(tmpDir, filename);
    if (!options.sha256) {
      log.warn(`Installing ${filename} from ${url} without a checksum: nothing verifies what was downloaded`);
    }

    // The signal bounds the body too, so a download that stalls fails instead of hanging the install
    const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    const response = await fetch(url, { signal }).catch(downloadFailed(url));
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    fs.writeFileSync(downloadPath, Buffer.from(await response.arrayBuffer().catch(downloadFailed(url))));

    return await installPackFromLocal(downloadPath, targetPacksDir, options);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function installPackFromGitHub(slug: string, targetPacksDir?: string, options: InstallOptions = {}): Promise<InstallResult> {
  const [ownerRepo, tag] = slug.split('@');
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) {
    throw new Error('GitHub slug must be in the format owner/repo or owner/repo@tag');
  }

  const apiUrl = tag
    ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`
    : `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  const release = await (await githubFetch(apiUrl)).json() as { assets: GitHubReleaseAsset[] };
  const tgzAsset = release.assets.find(a => a.name.endsWith('.tgz'));
  if (!tgzAsset) {
    throw new Error(`No .tgz asset found in release${tag ? ` ${tag}` : ' (latest)'}`);
  }

  // Releases published by `abuddy release` carry <archive>.sha256; without one, nothing says what was downloaded is the release
  let sha256 = options.sha256;
  if (!sha256) {
    const checksumAsset = release.assets.find(a => a.name === `${tgzAsset.name}.sha256`);
    if (!checksumAsset) {
      throw new Error(`Release${tag ? ` ${tag}` : ' (latest)'} of ${owner}/${repo} has no ${tgzAsset.name}.sha256; publish one with "abuddy release", or install with a checksum you know`);
    }
    sha256 = (await (await fetchReleaseAsset(checksumAsset)).text()).trim().split(/\s+/)[0];
    if (!/^[0-9a-f]{64}$/i.test(sha256)) {
      throw new Error(`${checksumAsset.name} in ${owner}/${repo} doesn't hold a sha256 checksum`);
    }
  }

  // Downloaded through GitHub's API when authenticated, so private repositories install too
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-install-'));
  try {
    const downloadPath = path.join(tmpDir, tgzAsset.name);
    fs.writeFileSync(downloadPath, Buffer.from(await (await fetchReleaseAsset(tgzAsset)).arrayBuffer()));
    return await installPackFromLocal(downloadPath, targetPacksDir, { ...options, sha256 });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function installPack(packSlug: string, source?: string, targetPacksDir?: string, options: InstallOptions = {}): Promise<InstallResult> {
  if (source === 'local') {
    return installPackFromLocal(packSlug, targetPacksDir, options);
  }
  if (source === 'url') {
    return installPackFromUrl(packSlug, targetPacksDir, options);
  }
  if (packSlug.startsWith('http://') || packSlug.startsWith('https://')) {
    return installPackFromUrl(packSlug, targetPacksDir, options);
  }
  return installPackFromGitHub(packSlug, targetPacksDir, options);
}

export async function uninstallPack(packId: string, targetPacksDir?: string): Promise<void> {
  const packsDir = targetPacksDir ?? resolveAppContext().packsDir;
  const packDir = path.join(packsDir, packId);

  if (!fs.existsSync(packDir)) {
    throw new Error(`Pack "${packId}" is not installed`);
  }

  fs.rmSync(packDir, { recursive: true, force: true });
  log.info(`Uninstalled pack "${packId}"`);
}


