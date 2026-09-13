import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { satisfies } from 'semver';
import { discoverBuiltInPacks } from './pack-discovery.js';
import { resolveAppContext } from '../env/index.js';
import { parseManifest } from '../build/validate.js';
import type { PackManifest } from '../build/manifest.js';
import {
  BUNDLE_PATHS,
  extractBundleArchive,
  hasBuiltBundleSections,
  isBundleDir,
  stageBundle,
  verifyBundle,
  type BundleInfo,
} from './bundle.js';

const log = {
  info(...args: unknown[]) { console.log(...args); },
  warn(...args: unknown[]) { console.warn(...args); },
};

export interface InstallResult {
  id: string;
  name: string;
  version: string;
  dir: string;
  missingDependencies: string[];
  /** Present for bundle installs; absent for legacy (pre-bundle) packs. */
  bundle?: BundleInfo;
}

export interface InstallOptions {
  /** Refuse packs whose manifest hostVersion this host doesn't satisfy (the app passes its version). */
  hostVersion?: string;
  /** Expected sha256 of a downloaded archive. */
  sha256?: string;
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

/** Whether an app at `appVersion` satisfies a pack's hostVersion range (prereleases included). */
export function isHostCompatible(hostRange: string | undefined, appVersion: string): boolean {
  if (!hostRange) return true;
  try {
    return satisfies(appVersion, hostRange, { includePrerelease: true });
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
export function hostPacksDirFor(packsDir: string): string {
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
      // Hidden dirs are publishes in progress (publishHostPackArtifacts)
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
  const incoming = fs.mkdtempSync(path.join(packsDir, `.${id}.installing-`));
  try {
    copyDir(sourceDir, incoming);
    const previous = fs.existsSync(destDir) ? path.join(packsDir, `.${id}.previous-${process.pid}`) : null;
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
 * - a bundle (bundle.json): verified, then copied as-is
 * - a pack source built in the bundle layout (dist/runtime, dist/types): staged into a bundle first
 * - a legacy pre-bundle pack (abuddy.json + dist/): copied as-is, with a warning
 */
async function installFromDirectory(dir: string, packsDir: string, options: InstallOptions): Promise<InstallResult> {
  const manifestSource = readValidManifest(dir);
  assertHostCompatible(manifestSource, options.hostVersion);

  let bundleDir = dir;
  let stageRoot: string | undefined;
  if (!isBundleDir(dir) && hasBuiltBundleSections(dir)) {
    stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-stage-'));
    bundleDir = path.join(stageRoot, manifestSource.id);
    stageBundle(dir, bundleDir);
  }

  try {
    let bundle: BundleInfo | undefined;
    if (isBundleDir(bundleDir)) {
      bundle = verifyBundle(bundleDir);
    } else if (fs.existsSync(path.join(dir, 'dist'))) {
      log.warn(`Installing ${manifestSource.id} in the pre-bundle layout (no ${BUNDLE_PATHS.info}); rebuild it with a current abuddy CLI`);
    } else {
      throw new Error('Pack is not built: no bundle.json or dist/ found. Run "abuddy build" first.');
    }

    const manifest = readValidManifest(bundleDir);
    const destDir = placePack(bundleDir, packsDir, manifest.id);
    const missingDependencies = checkDependencies(manifest, packsDir);
    log.info(`Installed "${manifest.name}" v${manifest.version} to ${destDir}`);
    return { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir, missingDependencies, bundle };
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
    let root: string;
    if (resolved.endsWith('.tgz') || resolved.endsWith('.tar.gz')) {
      root = await extractBundleArchive(resolved, tmpDir, options.sha256);
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

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    fs.writeFileSync(downloadPath, Buffer.from(await response.arrayBuffer()));

    return await installPackFromLocal(downloadPath, targetPacksDir, options);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

interface GitHubAsset { name: string; browser_download_url: string }

export async function installPackFromGitHub(slug: string, targetPacksDir?: string, options: InstallOptions = {}): Promise<InstallResult> {
  const [ownerRepo, tag] = slug.split('@');
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo) {
    throw new Error('GitHub slug must be in the format owner/repo or owner/repo@tag');
  }

  const apiUrl = tag
    ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`
    : `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  const response = await fetch(apiUrl, {
    headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AgentBuddy' },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const release = await response.json() as { assets: GitHubAsset[] };
  const tgzAsset = release.assets.find(a => a.name.endsWith('.tgz'));
  if (!tgzAsset) {
    throw new Error(`No .tgz asset found in release${tag ? ` ${tag}` : ' (latest)'}`);
  }

  // Releases published by `abuddy release` carry <archive>.sha256; older releases don't
  let sha256 = options.sha256;
  const checksumAsset = release.assets.find(a => a.name === `${tgzAsset.name}.sha256`);
  if (!sha256 && checksumAsset) {
    const res = await fetch(checksumAsset.browser_download_url);
    if (!res.ok) throw new Error(`Failed to download ${checksumAsset.name}: ${res.status}`);
    sha256 = (await res.text()).trim().split(/\s+/)[0];
  }

  return installPackFromUrl(tgzAsset.browser_download_url, targetPacksDir, { ...options, sha256 });
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
