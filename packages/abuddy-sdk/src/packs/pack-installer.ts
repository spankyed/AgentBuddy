import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { createLogger } from '../logger';

const logger = createLogger('pack-installer');

export interface InstallResult {
  id: string;
  name: string;
  version: string;
  dir: string;
}

function getPacksDir(): string {
  const userDataPath = process.env.USER_DATA_PATH || path.join(os.homedir(), '.agentbuddy');
  return path.join(userDataPath, 'packs');
}

function ensurePacksDir(): string {
  const dir = getPacksDir();
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

function validateManifest(dir: string): { id: string; name: string; version: string } {
  const manifestPath = path.join(dir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('No abuddy.json found in pack source');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error('abuddy.json missing required fields: id, name, version');
  }

  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) {
    throw new Error('abuddy.json: "id" must be lowercase alphanumeric with hyphens');
  }

  const distDir = path.join(dir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('No dist/ directory found. Pack must be built before installing.');
  }

  return manifest;
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

export async function installPackFromLocal(source: string): Promise<InstallResult> {
  const expanded = source.startsWith('~') ? source.replace('~', os.homedir()) : source;
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${resolved}`);
  }

  const packsDir = ensurePacksDir();
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
      logger.info(`Replacing existing pack ${manifest.id}`);
      fs.rmSync(destDir, { recursive: true, force: true });
    }

    copyDir(sourceDir, destDir);
    logger.info(`Installed "${manifest.name}" v${manifest.version} to ${destDir}`);

    return { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir };
  } finally {
    cleanup?.();
  }
}

export async function installPackFromUrl(url: string): Promise<InstallResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-install-'));
  try {
    const filename = new URL(url).pathname.split('/').pop() || 'pack.tgz';
    const downloadPath = path.join(tmpDir, filename);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(downloadPath, buffer);

    if (filename.endsWith('.tgz') || filename.endsWith('.tar.gz')) {
      const extractDir = path.join(tmpDir, 'extracted');
      extractTgz(downloadPath, extractDir);
      const sourceDir = findPackRoot(extractDir);
      const manifest = validateManifest(sourceDir);
      const packsDir = ensurePacksDir();
      const destDir = path.join(packsDir, manifest.id);

      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      copyDir(sourceDir, destDir);
      logger.info(`Installed "${manifest.name}" v${manifest.version} from URL`);
      return { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir };
    }

    if (filename.endsWith('.zip')) {
      const extractDir = path.join(tmpDir, 'extracted');
      extractZip(downloadPath, extractDir);
      const sourceDir = findPackRoot(extractDir);
      const manifest = validateManifest(sourceDir);
      const packsDir = ensurePacksDir();
      const destDir = path.join(packsDir, manifest.id);

      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      copyDir(sourceDir, destDir);
      logger.info(`Installed "${manifest.name}" v${manifest.version} from URL`);
      return { id: manifest.id, name: manifest.name, version: manifest.version, dir: destDir };
    }

    throw new Error('URL must point to a .tgz or .zip file');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function installPackFromGitHub(slug: string): Promise<InstallResult> {
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

  return installPackFromUrl(tgzAsset.browser_download_url);
}

export async function installPack(packSlug: string, source?: string): Promise<InstallResult> {
  if (source === 'local') {
    return installPackFromLocal(packSlug);
  }
  if (source === 'url') {
    return installPackFromUrl(packSlug);
  }
  if (packSlug.startsWith('http://') || packSlug.startsWith('https://')) {
    return installPackFromUrl(packSlug);
  }
  return installPackFromGitHub(packSlug);
}

export async function uninstallPack(packId: string): Promise<void> {
  const packsDir = getPacksDir();
  const packDir = path.join(packsDir, packId);

  if (!fs.existsSync(packDir)) {
    throw new Error(`Pack "${packId}" is not installed`);
  }

  fs.rmSync(packDir, { recursive: true, force: true });
  logger.info(`Uninstalled pack "${packId}"`);
}
