import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../logger';
import { readPackRegistry, writePackRegistry, addToRegistry } from './pack-registry';

const logger = createLogger('pack-discovery');

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

export interface PackManifest {
  id: string;
  name: string;
  version: string;
  hostVersion?: string;
  seedTypes?: string[];
  plugins?: PackPluginDefinition[];
  fe?: { entry: string; styles?: string };
  permissions?: string[];
  entities?: Record<string, string>;
  relKinds?: Record<string, string>;
}

export interface PackPluginDefinition {
  id: string;
  priority?: number;
  system?: {
    entry: string;
    events?: {
      incoming?: string[];
      outgoing?: string[];
    };
  };
  plugin?: {
    entry: string;
    label: string;
    icon: string;
  };
  entities?: string[];
  settings?: Record<string, unknown>;
}

export const APP_NAME = 'abuddy';
export const DEV_APP_NAME = 'abuddy-dev';

export function resolveAppDataDir(appName: string): string {
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
  const userDataPath = process.env.USER_DATA_PATH || path.join(os.homedir(), '.agentbuddy');
  return path.join(userDataPath, 'packs');
}

export function getPacksDirForEnv(dev: boolean): string {
  return path.join(resolveAppDataDir(dev ? DEV_APP_NAME : APP_NAME), 'packs');
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
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackManifest;
      if (!manifest.id || !manifest.name) {
        logger.warn(`Skipping ${entry.name}: invalid manifest (missing id or name)`);
        continue;
      }
      results.push({ manifest, dir: packDir });
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
