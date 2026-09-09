import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

export function getPacksDir(): string {
  const userDataPath = process.env.USER_DATA_PATH || path.join(os.homedir(), '.agentbuddy');
  return path.join(userDataPath, 'packs');
}

function ensurePacksDir(): string {
  const dir = getPacksDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extractZip(zipPath: string, destDir: string): void {
  execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'pipe' });
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function validateInstallSource(dir: string): { id: string; name: string; version: string; dependencies?: Record<string, string> } {
  const manifestPath = path.join(dir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('No abuddy.json found in pack source. Run "abuddy build" first.');
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
    throw new Error('No dist/ directory found. Run "abuddy build" first.');
  }

  return manifest;
}

// Built-in packs ship with the app and are always loaded at boot, so dependencies
// on them are always satisfied. We discover their IDs by scanning the monorepo's
// packages/ dir (4 levels up: commands/ → cli/ → src/ → abuddy-sdk/ → packages/)
// for abuddy.json manifests with builtIn: true. Silently returns empty if the
// workspace isn't reachable (e.g. SDK installed standalone).
function discoverBuiltInPackIds(): Set<string> {
  const ids = new Set<string>();
  const packagesDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..', '..', '..', '..',
  );
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

function checkDependencies(manifest: { dependencies?: Record<string, string> }, packsDir: string): string[] {
  const deps = manifest.dependencies ?? {};
  const missing: string[] = [];
  const builtInIds = discoverBuiltInPackIds();

  for (const depId of Object.keys(deps)) {
    if (builtInIds.has(depId)) continue;
    const depManifest = path.join(packsDir, depId, 'abuddy.json');
    if (!fs.existsSync(depManifest)) {
      missing.push(depId);
    }
  }

  return missing;
}

export async function install(args: string[]) {
  const source = args[0];
  if (!source) {
    throw new Error('Usage: abuddy install <path-to-pack>\n\nProvide a path to a pack directory or .zip file.');
  }

  const packsDir = ensurePacksDir();
  const resolved = path.resolve(source);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${resolved}`);
  }

  let sourceDir: string;
  let cleanup: (() => void) | undefined;

  if (resolved.endsWith('.zip')) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-pack-'));
    extractZip(resolved, tmpDir);
    if (fs.existsSync(path.join(tmpDir, 'abuddy.json'))) {
      sourceDir = tmpDir;
    } else {
      const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory() && !e.isSymbolicLink());
      sourceDir = dirs.length === 1 ? path.join(tmpDir, dirs[0].name) : tmpDir;
    }
    cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });
  } else if (fs.statSync(resolved).isDirectory()) {
    sourceDir = resolved;
  } else {
    throw new Error('Source must be a directory or .zip file');
  }

  try {
    const manifest = validateInstallSource(sourceDir);
    const missing = checkDependencies(manifest, packsDir);
    if (missing.length > 0) {
      console.warn(`\n  Warning: missing dependencies: ${missing.join(', ')}`);
      console.warn(`  Install them first for full functionality.`);
    }

    const destDir = path.join(packsDir, manifest.id);

    if (fs.existsSync(destDir)) {
      const existingManifest = JSON.parse(
        fs.readFileSync(path.join(destDir, 'abuddy.json'), 'utf-8'),
      );
      console.log(`Updating ${manifest.name} from v${existingManifest.version} to v${manifest.version}`);
      fs.rmSync(destDir, { recursive: true, force: true });
    }

    copyDir(sourceDir, destDir);

    console.log(`\nInstalled "${manifest.name}" v${manifest.version}`);
    console.log(`  Location: ${destDir}`);
    console.log(`\nRestart AgentBuddy to load the pack.`);
  } finally {
    cleanup?.();
  }
}
