import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';
import { createLogger } from '@/core/shared/debug/logger';
import { registerPack } from './pack-registration';
import { compareVersions } from '@/core/shared';
import { APP_VERSION } from '@/version';
import {
  discoverBuiltInPacks,
  getPacksDir,
  discoverPacks,
  reconcileExternalRegistry,
} from './pack-discovery';

// @ts-ignore TS1343 — runtime is ESM despite CJS tsconfig
const _metaUrl: string = import.meta.url;
const esmRequire = typeof require === 'function' ? require : Module.createRequire(_metaUrl);
const logger = createLogger('pack-loader');

// Re-export discovery types and seed helpers for backward-compatible imports
export type { BuiltInPackInfo, PackManifest, PackPluginDefinition } from './pack-discovery';
export { discoverBuiltInPacks } from './pack-discovery';
export { computePackSeedHash, seedPackData } from './pack-seed';

// ── Built-in pack loading ────────────────────────────────────────────

// @tsup-rewrite-start loadBuiltInPacks
export async function loadBuiltInPacks(packagesDir: string): Promise<void> {
  const discovered = discoverBuiltInPacks(packagesDir);
  if (discovered.length === 0) {
    logger.warn('No built-in packs found in ' + packagesDir);
    return;
  }
  for (const pack of discovered) {
    const entryPath = path.join(pack.dir, pack.entry);
    try {
      const mod = await import(entryPath);
      if (!mod.registration) {
        logger.warn(`Built-in pack ${pack.id}: no 'registration' export, skipping`);
        continue;
      }
      registerPack(mod.registration);
      logger.info(`Loaded built-in pack: ${pack.id}`);
    } catch (err) {
      logger.error(`Failed to load built-in pack ${pack.id}:`, err as Error);
    }
  }
}
// @tsup-rewrite-end loadBuiltInPacks

// ── External pack loading ────────────────────────────────────────────

const HOST_PROVIDED_PACKAGES = ['xstate', 'zod'];

export interface LoadedPack {
  manifest: import('./pack-discovery').PackManifest;
  dir: string;
  systems: Map<string, { machine: import('xstate').AnyStateMachine; events: Set<string> }>;
  services?: Record<string, unknown>;
  steps?: import('@abuddy/sdk/steps').StepDefinition[];
  artifacts?: import('@abuddy/sdk/artifacts').ArtifactDefinition[];
  blocks?: import('@abuddy/sdk/blocks').BlockDefinition[];
  ears?: import('@abuddy/sdk/framework').PackEARS;
  boot?: import('@abuddy/sdk/framework').PackBootHooks;
  migrations?: import('@abuddy/sdk/framework').PackMigration[];
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
): { machine: import('xstate').AnyStateMachine; events: Set<string> } | null {
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
  const enabled = reconcileExternalRegistry(discovered);

  if (enabled.length === 0) return [];

  logger.info(`Loading ${enabled.length} external pack(s)`);
  const loaded: LoadedPack[] = [];

  for (const { manifest, dir } of enabled) {
    if (manifest.hostVersion) {
      const minVersion = manifest.hostVersion.replace(/^>=?\s*/, '');
      if (compareVersions(APP_VERSION, minVersion) < 0) {
        logger.warn(`Skipping ${manifest.id}: requires host ${manifest.hostVersion}, running ${APP_VERSION}`);
        continue;
      }
    }

    const systems = new Map<string, { machine: import('xstate').AnyStateMachine; events: Set<string> }>();

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
      registered.push(pack);
      logger.info(`Registered pack: ${pack.manifest.id} (${systems.length} systems)`);
    } catch (err) {
      logger.error(`Failed to register pack ${pack.manifest.id}:`, err as Error);
    }
  }
  return registered;
}
