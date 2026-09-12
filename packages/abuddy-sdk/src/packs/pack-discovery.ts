import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../logger';
import { readPackRegistry, writePackRegistry, addToRegistry } from './pack-registry';
import type { PackManifest } from '../build/manifest';

const logger = createLogger('pack-discovery');

export type { PackManifest };

// ── Built-in pack discovery ─────────────────────────────────────────

export interface BuiltInPackInfo {
  id: string;
  name: string;
  version: string;
  dir: string;
  entry: string;
}

export function discoverBuiltInPacks(packagesDir: string): BuiltInPackInfo[] {
  if (!fs.existsSync(packagesDir)) return [];

  const results: BuiltInPackInfo[] = [];
  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesDir, entry.name);
    const manifestPath = path.join(dir, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!manifest.builtIn || !manifest.id || !manifest.name) continue;

      const entryFile = path.join(dir, 'src', '__generated__', 'pack-entry');
      const hasEntry = fs.existsSync(entryFile + '.ts') || fs.existsSync(entryFile + '.js');
      if (!hasEntry) {
        logger.warn(`Built-in pack ${manifest.id}: no src/__generated__/pack-entry found, skipping`);
        continue;
      }

      results.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version ?? '0.0.0',
        dir,
        entry: 'src/__generated__/pack-entry',
      });
    } catch {}
  }

  return results;
}

// ── External pack discovery ─────────────────────────────────────────

export type AppEnv = 'production' | 'development' | 'test' | 'beta';

const APP_NAMES: Record<AppEnv, string> = {
  production:  'abuddy',
  beta:        'abuddy-beta',
  development: 'abuddy-dev',
  test:        'abuddy-test',
};

export function getAppName(env: AppEnv): string {
  return APP_NAMES[env];
}

export function resolveAppEnv(): AppEnv {
  if (process.env.PLAYWRIGHT_TEST === 'true') return 'test';
  if (process.env.ABUDDY_ENV === 'beta') return 'beta';
  if (process.env.NODE_ENV === 'development') return 'development';
  return 'production';
}

export function resolveAppDataDir(appNameOrEnv: string | AppEnv): string {
  const appName = APP_NAMES[appNameOrEnv as AppEnv] ?? appNameOrEnv;
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', appName);
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
    default:
      return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), appName);
  }
}

export function getPacksDir(): string {
  const userDataPath = process.env.USER_DATA_PATH || resolveAppDataDir('production');
  return path.join(userDataPath, 'packs');
}

export function getApiPortFile(env?: AppEnv): string {
  const resolved = env ?? resolveAppEnv();
  return path.join(resolveAppDataDir(resolved), 'api-port');
}

export function getPacksDirForEnv(env: AppEnv): string {
  return path.join(resolveAppDataDir(env), 'packs');
}

export function discoverPacks(packsDir: string): { manifest: PackManifest; dir: string }[] {
  if (!fs.existsSync(packsDir)) return [];

  const results: { manifest: PackManifest; dir: string }[] = [];
  const entries = fs.readdirSync(packsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packDir = path.join(packsDir, entry.name);
    const manifestPath = path.join(packDir, 'abuddy.json');

    if (!fs.existsSync(manifestPath)) {
      logger.warn(`Skipping ${entry.name}: no abuddy.json`);
      continue;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!raw.id || !raw.name || !raw.version) {
        logger.warn(`Skipping ${entry.name}: manifest missing id, name, or version`);
        continue;
      }
      results.push({ manifest: raw as PackManifest, dir: packDir });
    } catch (err) {
      logger.warn(`Skipping ${entry.name}: failed to parse abuddy.json`);
    }
  }

  return results;
}

export function reconcileExternalRegistry(
  discovered: { manifest: PackManifest; dir: string }[],
): { manifest: PackManifest; dir: string }[] {
  let registry = readPackRegistry();
  let changed = false;

  const discoveredById = new Map(discovered.map(d => [d.manifest.id, d]));

  for (const { manifest, dir } of discovered) {
    const existing = registry.find(e => e.id === manifest.id);
    if (!existing) {
      registry = addToRegistry(registry, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        dir,
        enabled: true,
      });
      changed = true;
      logger.info(`New external pack discovered: ${manifest.id}`);
    } else if (existing.version !== manifest.version || existing.dir !== dir) {
      registry = addToRegistry(registry, {
        id: existing.id,
        name: manifest.name,
        version: manifest.version,
        dir,
        enabled: existing.enabled,
      });
      changed = true;
    }
  }

  const before = registry.length;
  registry = registry.filter(e => discoveredById.has(e.id));
  if (registry.length !== before) changed = true;

  if (changed) writePackRegistry(registry);

  const enabledIds = new Set(registry.filter(e => e.enabled).map(e => e.id));
  return discovered.filter(d => enabledIds.has(d.manifest.id));
}
