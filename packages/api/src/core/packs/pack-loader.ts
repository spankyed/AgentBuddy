import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import Module from 'module';
import { createLogger } from '@/core/shared/debug/logger';
import { registerPack } from './pack-registration';
import { registerShutdownHook } from '@/core/shared/lifecycle';
import { APP_VERSION } from '@/version';
import {
  readPackRegistry, writePackRegistry, addToRegistry,
  type PackRegistryEntry,
} from './pack-registry';

// @ts-ignore TS1343 — runtime is ESM despite CJS tsconfig
const _metaUrl: string = import.meta.url;
const esmRequire = typeof require === 'function' ? require : Module.createRequire(_metaUrl);
const logger = createLogger('pack-loader');

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

      const entryFile = path.join(dir, 'src', 'pack-entry');
      const hasEntry = fs.existsSync(entryFile + '.ts') || fs.existsSync(entryFile + '.js');
      if (!hasEntry) {
        logger.warn(`Built-in pack ${manifest.id}: no src/pack-entry found, skipping`);
        continue;
      }

      results.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version ?? '0.0.0',
        dir,
        entry: 'src/pack-entry',
      });
    } catch {}
  }

  return results;
}

export function seedBuiltInPacks(builtInDir: string): PackRegistryEntry[] {
  let registry = readPackRegistry();
  const discovered = discoverBuiltInPacks(builtInDir);

  if (discovered.length === 0) {
    logger.warn('No built-in packs found in ' + builtInDir);
    return registry;
  }

  let changed = false;
  for (const pack of discovered) {
    const existing = registry.find(e => e.id === pack.id && e.type === 'built-in');
    if (existing && existing.dir === pack.dir && existing.version === pack.version) continue;

    registry = addToRegistry(registry, {
      id: pack.id,
      name: pack.name,
      version: pack.version,
      dir: pack.dir,
      entry: pack.entry,
      type: 'built-in',
    });
    changed = true;
    logger.info(`${existing ? 'Updated' : 'Registered'} built-in pack: ${pack.id}`);
  }

  if (changed) writePackRegistry(registry);
  return registry;
}

export async function loadRegisteredPacks(registry: PackRegistryEntry[]): Promise<void> {
  for (const entry of registry) {
    const entryPath = path.join(entry.dir, entry.entry);
    try {
      const mod = await import(entryPath);
      if (!mod.registration) {
        logger.warn(`Pack ${entry.id}: module at ${entryPath} has no 'registration' export, skipping`);
        continue;
      }
      registerPack(mod.registration);
      logger.info(`Loaded pack: ${entry.id} (${entry.type})`);
    } catch (err) {
      logger.error(`Failed to load pack ${entry.id} from ${entryPath}:`, err as Error);
    }
  }
}

export async function loadBuiltInPacksFromDir(packagesDir: string): Promise<void> {
  seedBuiltInPacks(packagesDir);
  const registry = readPackRegistry();
  await loadRegisteredPacks(registry.filter(e => e.type === 'built-in'));
}

export function reconcileExternalPacks(registry: PackRegistryEntry[]): PackRegistryEntry[] {
  const externalDir = getPacksDir();
  if (!fs.existsSync(externalDir)) return registry;

  const onDisk = discoverPacks(externalDir);
  const registeredExternal = new Set(
    registry.filter(e => e.type === 'external').map(e => e.id)
  );

  let changed = false;

  for (const { manifest, dir } of onDisk) {
    if (!registeredExternal.has(manifest.id)) {
      registry = addToRegistry(registry, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        dir,
        entry: 'dist/index.js',
        type: 'external',
      });
      logger.info(`Auto-registered new external pack: ${manifest.id}`);
      changed = true;
    }
  }

  const onDiskIds = new Set(onDisk.map(p => p.manifest.id));
  const stale = registry.filter(e => e.type === 'external' && !onDiskIds.has(e.id));
  if (stale.length > 0) {
    registry = registry.filter(e => !(e.type === 'external' && !onDiskIds.has(e.id)));
    for (const s of stale) {
      logger.info(`Removed stale external pack from registry: ${s.id}`);
    }
    changed = true;
  }

  if (changed) writePackRegistry(registry);
  return registry;
}

// Packages provided by the host that packs can require() without bundling
const HOST_PROVIDED_PACKAGES = ['xstate', 'zod'];

export interface PackManifest {
  id: string;
  name: string;
  version: string;
  hostVersion?: string;
  seedTypes?: string[];
  plugins?: PackPluginDefinition[];
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

export interface LoadedPack {
  manifest: PackManifest;
  dir: string;
  systems: Map<string, { machine: any; events: Set<string> }>;
  services?: Record<string, unknown>;
  steps?: import('@abuddy/sdk/steps').StepDefinition[];
  artifacts?: import('@abuddy/sdk/artifacts').ArtifactDefinition[];
  blocks?: import('@abuddy/sdk/blocks').BlockDefinition[];
  ears?: import('@abuddy/sdk/framework').PackEARS;
  boot?: import('@abuddy/sdk/framework').PackBootHooks;
  migrations?: import('@abuddy/sdk/framework').PackMigration[];
}

function getPacksDir(): string {
  const userDataPath = process.env.USER_DATA_PATH || path.join(os.homedir(), '.agentbuddy');
  return path.join(userDataPath, 'packs');
}

function discoverPacks(packsDir: string): { manifest: PackManifest; dir: string }[] {
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

function withHostResolution<T>(fn: () => T): T {
  const originalResolve = (Module as any)._resolveFilename;

  const hostResolutions = new Map<string, string>();
  try {
    const sdkEntry = esmRequire.resolve('@abuddy/sdk');
    hostResolutions.set('@abuddy/sdk', sdkEntry.replace(/\/index\.(js|cjs|ts)$/, ''));
  } catch {}
  for (const pkg of HOST_PROVIDED_PACKAGES) {
    try { hostResolutions.set(pkg, esmRequire.resolve(pkg)); } catch {}
  }

  try {
    (Module as any)._resolveFilename = function (request: string, ...args: any[]) {
      if (request.startsWith('@abuddy/sdk')) {
        const sdkBase = hostResolutions.get('@abuddy/sdk');
        if (sdkBase) {
          const mapped = request.replace('@abuddy/sdk', sdkBase);
          return originalResolve.call(this, mapped, ...args);
        }
      }
      if (hostResolutions.has(request)) {
        return hostResolutions.get(request)!;
      }
      return originalResolve.call(this, request, ...args);
    };

    return fn();
  } finally {
    (Module as any)._resolveFilename = originalResolve;
  }
}

function loadSystemFromCJS(
  entry: string,
  packDir: string,
): { machine: any; events: Set<string> } | null {
  const fullPath = path.resolve(packDir, entry);
  if (!fullPath.startsWith(packDir + path.sep)) {
    logger.warn(`System entry escapes pack directory: ${entry}`);
    return null;
  }
  if (!fs.existsSync(fullPath)) {
    logger.warn(`System entry not found: ${fullPath}`);
    return null;
  }

  try {
    return withHostResolution(() => {
      const mod = esmRequire(fullPath);
      const machine = mod.default || mod.system || mod.machine;
      if (!machine) {
        logger.warn(`No machine export found in ${entry}`);
        return null;
      }
      return { machine, events: new Set<string>(machine.events || []) };
    });
  } catch (err) {
    logger.error(`Failed to load system from ${entry}:`, err as Error);
    return null;
  }
}

export function loadExternalPacks(): LoadedPack[] {
  const packsDir = getPacksDir();
  const discovered = discoverPacks(packsDir);

  if (discovered.length === 0) return [];

  logger.info(`Found ${discovered.length} external pack(s)`);
  const loaded: LoadedPack[] = [];

  for (const { manifest, dir } of discovered) {
    if (manifest.hostVersion) {
      const minVersion = manifest.hostVersion.replace(/^>=?\s*/, '');
      if (APP_VERSION.localeCompare(minVersion, undefined, { numeric: true }) < 0) {
        logger.warn(`Skipping ${manifest.id}: requires host ${manifest.hostVersion}, running ${APP_VERSION}`);
        continue;
      }
    }

    const systems = new Map<string, { machine: any; events: Set<string> }>();

    if (manifest.plugins) {
      for (const plugin of manifest.plugins) {
        if (!plugin.system?.entry) continue;

        const system = loadSystemFromCJS(plugin.system.entry, dir);
        if (system) {
          if (plugin.system.events?.incoming) {
            for (const evt of plugin.system.events.incoming) {
              system.events.add(evt);
            }
          }
          systems.set(plugin.id, system);
          logger.info(`Loaded system: ${manifest.id}/${plugin.id}`);
        }
      }
    }

    const pack: LoadedPack = { manifest, dir, systems };

    const mainEntry = path.join(dir, 'dist', 'index.js');
    if (fs.existsSync(mainEntry)) {
      try {
        withHostResolution(() => {
          const mod = esmRequire(mainEntry);
          if (mod.services) pack.services = mod.services;
          if (mod.steps) pack.steps = mod.steps;
          if (mod.artifacts) pack.artifacts = mod.artifacts;
          if (mod.blocks) pack.blocks = mod.blocks;
          if (mod.ears) pack.ears = mod.ears;
          if (mod.boot) pack.boot = mod.boot;
          if (mod.migrations) pack.migrations = mod.migrations;
        });
      } catch (err) {
        logger.warn(`Failed to load pack entry for ${manifest.id}:`, err as Error);
      }
    }

    if (!pack.ears && (manifest.entities || manifest.relKinds)) {
      pack.ears = { entities: manifest.entities ?? {}, relKinds: manifest.relKinds ?? {} };
    }

    if (pack.boot?.earlySystem) {
      logger.warn(`Pack ${manifest.id}: earlySystem blocked for external packs`);
      delete pack.boot.earlySystem;
    }
    if (pack.ears?.partitionPolicy) {
      logger.warn(`Pack ${manifest.id}: partitionPolicy ignored for external packs (v1)`);
      delete pack.ears.partitionPolicy;
    }

    loaded.push(pack);
  }

  return loaded;
}

export function registerPackSystems(
  packs: LoadedPack[],
  systemsMap: Record<string, any>,
  eventValidationMap: Map<string, Set<string>>,
) {
  for (const pack of packs) {
    for (const [featureId, system] of pack.systems) {
      const systemId = `${pack.manifest.id}.${featureId}`;
      systemsMap[systemId] = system.machine;
      eventValidationMap.set(systemId, system.events);
      logger.info(`Registered system: ${systemId}`);
    }
  }
}

export function registerExternalPacks(packs: LoadedPack[]): LoadedPack[] {
  const registered: LoadedPack[] = [];
  for (const pack of packs) {
    const systems = Array.from(pack.systems.entries()).map(([featureId, sys]) => ({
      id: `${pack.manifest.id}.${featureId}`,
      machine: sys.machine,
      events: sys.events,
    }));
    try {
      registerPack({
        id: pack.manifest.id,
        systems,
        services: pack.services,
        steps: pack.steps,
        artifacts: pack.artifacts,
        blocks: pack.blocks,
        ears: pack.ears,
        boot: pack.boot,
        migrations: pack.migrations,
      });
      if (pack.boot?.shutdown) {
        registerShutdownHook(pack.boot.shutdown);
      }
      registered.push(pack);
      logger.info(`Registered pack: ${pack.manifest.id} (${systems.length} systems)`);
    } catch (err) {
      logger.error(`Failed to register pack ${pack.manifest.id}:`, err as Error);
    }
  }
  return registered;
}

export function computePackSeedHash(distDir: string): string {
  const files = fs.readdirSync(distDir).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) return '';
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(distDir, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

export function seedPackData(
  packs: LoadedPack[],
  seedFn: (options: { compiledDir: string; mode?: any; verbose?: boolean }) => Record<string, any>,
  getStoredHashes: () => Record<string, string>,
  setStoredHashes: (hashes: Record<string, string>) => void,
): void {
  const storedHashes = getStoredHashes();
  const updatedHashes = { ...storedHashes };
  let anySeeded = false;

  for (const pack of packs) {
    const distDir = path.join(pack.dir, 'dist');
    if (!fs.existsSync(distDir)) continue;

    const currentHash = computePackSeedHash(distDir);
    if (!currentHash) continue;

    if (storedHashes[pack.manifest.id] === currentHash) {
      logger.info(`Pack seed skipped (unchanged): ${pack.manifest.id}`);
      continue;
    }

    logger.info(`Seeding data artifacts for pack: ${pack.manifest.id}`);
    try {
      seedFn({ compiledDir: distDir, mode: 'replace-on-collision' });
      updatedHashes[pack.manifest.id] = currentHash;
      anySeeded = true;
      logger.info(`Pack seeded: ${pack.manifest.id}`);
    } catch (err) {
      logger.error(`Failed to seed pack ${pack.manifest.id}:`, err as Error);
    }
  }

  // Clean up hashes for packs no longer installed
  const installedIds = new Set(packs.map(p => p.manifest.id));
  for (const id of Object.keys(updatedHashes)) {
    if (!installedIds.has(id)) delete updatedHashes[id];
  }

  if (anySeeded || Object.keys(updatedHashes).length !== Object.keys(storedHashes).length) {
    setStoredHashes(updatedHashes);
  }
}
