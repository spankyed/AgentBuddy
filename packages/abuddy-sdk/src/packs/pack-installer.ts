import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { discoverBuiltInPacks } from './pack-discovery';
import { resolveAppContext } from '../env';
import { parseManifest } from '../build/validate';
import type { PackManifest } from '../build/manifest';

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

function extractTgz(tgzPath: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['-xzf', tgzPath, '-C', destDir], { stdio: 'pipe' });
}

function validateManifest(dir: string): PackManifest {
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

  const distDir = path.join(dir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('No dist/ directory found. Pack must be built before installing.');
  }

  return raw as PackManifest;
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

function getBuiltInPackIds(): Set<string> {
  const ids = new Set<string>();
  const builtInDir = process.env.BUILT_IN_PACKS_DIR;
  if (builtInDir) {
    for (const pack of discoverBuiltInPacks(builtInDir)) ids.add(pack.id);
    return ids;
  }
  const packagesDir = path.resolve(__dirname, '..', '..', '..');
  try {
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(packagesDir, entry.name, 'abuddy.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (m.builtIn && m.id) ids.add(m.id);
      } catch {}
    }
  } catch {}
  return ids;
}

export function checkDependencies(
  manifest: { dependencies?: Record<string, string> },
  packsDir: string,
): string[] {
  const deps = manifest.dependencies ?? {};
  if (Object.keys(deps).length === 0) return [];
  const builtInIds = getBuiltInPackIds();
  const missing: string[] = [];
  for (const depId of Object.keys(deps)) {
    if (builtInIds.has(depId)) continue;
    if (!fs.existsSync(path.join(packsDir, depId, 'abuddy.json'))) missing.push(depId);
  }
  return missing;
}

export async function installPackFromLocal(source: string, targetPacksDir?: string): Promise<InstallResult> {
  const expanded = source.startsWith('~') ? source.replace('~', os.homedir()) : source;
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${resolved}`);
  }

  const packsDir = ensurePacksDir(targetPacksDir);
  let sourceDir: string;
  let cleanup: (() => void) | undefined;

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    sourceDir = resolved;
  } else if (resolved.endsWith('.zip')) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-install-'));
    extractZip(resolved, tmpDir);
    sourceDir = findPackRoot(tmpDir);
    cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });
  } else if (resolved.endsWith('.tgz') || resolved.endsWith('.tar.gz')) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-install-'));
    extractTgz(resolved, tmpDir);
    sourceDir = findPackRoot(tmpDir);
    cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });
  } else {
    throw new Error('Source must be a directory, .zip, or .tgz file');
  }

  try {
    const manifest = validateManifest(sourceDir);
    const destDir = path.join(packsDir, manifest.id);

    if (fs.existsSync(destDir)) {
      console.log(`Replacing existing pack ${manifest.id}`);
      fs.rmSync(destDir, { recursive: true, force: true });
    }

    copyDir(sourceDir, destDir);
    const missingDependencies = checkDependencies(
      JSON.parse(fs.readFileSync(path.join(destDir, 'abuddy.json'), 'utf-8')),
      packsDir,
    );
    log.info(`Installed "${manifest.name}" v${manifest.version} to ${destDir}`);

    return { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir, missingDependencies };
  } finally {
    cleanup?.();
  }
}

export async function installPackFromUrl(url: string, targetPacksDir?: string): Promise<InstallResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-install-'));
  try {
    const filename = new URL(url).pathname.split('/').pop() || 'pack.tgz';
    const downloadPath = path.join(tmpDir, filename);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(downloadPath, buffer);

    const extractDir = path.join(tmpDir, 'extracted');
    if (filename.endsWith('.tgz') || filename.endsWith('.tar.gz')) {
      extractTgz(downloadPath, extractDir);
    } else if (filename.endsWith('.zip')) {
      extractZip(downloadPath, extractDir);
    } else {
      throw new Error('URL must point to a .tgz or .zip file');
    }

    const sourceDir = findPackRoot(extractDir);
    const manifest = validateManifest(sourceDir);
    const packsDir = ensurePacksDir(targetPacksDir);
    const destDir = path.join(packsDir, manifest.id);

    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    copyDir(sourceDir, destDir);
    const missingDependencies = checkDependencies(
      JSON.parse(fs.readFileSync(path.join(destDir, 'abuddy.json'), 'utf-8')),
      packsDir,
    );
    log.info(`Installed "${manifest.name}" v${manifest.version} from URL`);
    return { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir, missingDependencies };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function installPackFromGitHub(slug: string, targetPacksDir?: string): Promise<InstallResult> {
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

  const release = await response.json() as { assets: { name: string; browser_download_url: string }[] };
  const tgzAsset = release.assets.find((a: any) => a.name.endsWith('.tgz'));
  if (!tgzAsset) {
    throw new Error(`No .tgz asset found in release${tag ? ` ${tag}` : ' (latest)'}`);
  }

  return installPackFromUrl(tgzAsset.browser_download_url, targetPacksDir);
}

export async function installPack(packSlug: string, source?: string, targetPacksDir?: string): Promise<InstallResult> {
  if (source === 'local') {
    return installPackFromLocal(packSlug, targetPacksDir);
  }
  if (source === 'url') {
    return installPackFromUrl(packSlug, targetPacksDir);
  }
  if (packSlug.startsWith('http://') || packSlug.startsWith('https://')) {
    return installPackFromUrl(packSlug, targetPacksDir);
  }
  return installPackFromGitHub(packSlug, targetPacksDir);
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
