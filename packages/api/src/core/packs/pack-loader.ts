import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Module from 'module';
import { createLogger } from '@/core/shared/debug/logger';
import { APP_VERSION } from '@/version';

const logger = createLogger('pack-loader');

// Packages provided by the host that packs can require() without bundling
const HOST_PROVIDED_PACKAGES = ['xstate', 'zod'];

export interface PackManifest {
  id: string;
  name: string;
  version: string;
  hostVersion?: string;
  artifactTypes?: string[];
  features?: PackFeatureEntry[];
  permissions?: string[];
}

export interface PackFeatureEntry {
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

  const originalResolve = (Module as any)._resolveFilename;

  // Pre-resolve all host-provided paths BEFORE installing the override to avoid recursion
  const hostResolutions = new Map<string, string>();
  try {
    const sdkEntry = require.resolve('@abuddy/sdk');
    hostResolutions.set('@abuddy/sdk', sdkEntry.replace(/\/index\.(js|cjs|ts)$/, ''));
  } catch {}
  for (const pkg of HOST_PROVIDED_PACKAGES) {
    try { hostResolutions.set(pkg, require.resolve(pkg)); } catch {}
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

    const mod = require(fullPath);
    const machine = mod.default || mod.system || mod.machine;
    if (!machine) {
      logger.warn(`No machine export found in ${entry}`);
      return null;
    }

    return { machine, events: new Set<string>(machine.events || []) };
  } catch (err) {
    logger.error(`Failed to load system from ${entry}:`, err as Error);
    return null;
  } finally {
    (Module as any)._resolveFilename = originalResolve;
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

    if (manifest.features) {
      for (const feature of manifest.features) {
        if (!feature.system?.entry) continue;

        const system = loadSystemFromCJS(feature.system.entry, dir);
        if (system) {
          // Merge manifest-declared events with runtime-detected events
          if (feature.system.events?.incoming) {
            for (const evt of feature.system.events.incoming) {
              system.events.add(evt);
            }
          }
          systems.set(feature.id, system);
          logger.info(`Loaded system: ${manifest.id}/${feature.id}`);
        }
      }
    }

    loaded.push({ manifest, dir, systems });
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
