import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';
import { createLogger } from '@/core/shared/debug/logger';
import { compareVersions } from '@abuddy/sdk/utils';
import { APP_VERSION } from '@/version';
import {
  registerPack,
  discoverBuiltInPacks,
  type BuiltInPackInfo,
  getPacksDir,
  discoverPacks,
  reconcileExternalRegistry,
} from '@abuddy/sdk/packs';
import type { PackSnapshot } from '@abuddy/sdk/build';
import { getSharedBeDeps, findSdkVersion } from '@abuddy/sdk/build';

// ── SDK bridge ──────────────────────────────────────────────────────
// The API bundle inlines @abuddy/sdk (tsup bundles it). Any CJS code
// loaded at runtime (external packs, built-in dev entry) that does
// require('@abuddy/sdk/ears') would get a SEPARATE module instance
// with empty singleton state (Maps, registries). These static imports
// resolve to the BUNDLED instances — the ones with hydrated data.
// withHostResolution injects them into esmRequire.cache so dynamically
// loaded pack code shares the real singletons.
import * as _sdkRoot from '@abuddy/sdk';
import * as _sdkEars from '@abuddy/sdk/ears';
import * as _sdkEarsInternals from '@abuddy/sdk/ears/internals';
import * as _sdkFramework from '@abuddy/sdk/framework';
import * as _sdkHelpers from '@abuddy/sdk/helpers';
import * as _sdkPacks from '@abuddy/sdk/packs';
import * as _sdkUtils from '@abuddy/sdk/utils';
import * as _sdkUtilsPure from '@abuddy/sdk/utils/pure';
import * as _sdkRpc from '@abuddy/sdk/rpc';
import * as _sdkIds from '@abuddy/sdk/ids';
import * as _sdkLogger from '@abuddy/sdk/logger';
import * as _sdkServices from '@abuddy/sdk/services';
import * as _sdkSeed from '@abuddy/sdk/seed';
import * as _sdkBackup from '@abuddy/sdk/backup';
import * as _sdkSteps from '@abuddy/sdk/steps';
import * as _sdkArtifacts from '@abuddy/sdk/artifacts';
import * as _sdkBlocks from '@abuddy/sdk/blocks';
import * as _sdkBuild from '@abuddy/sdk/build';
import * as _sdkTypes from '@abuddy/sdk/types';
import * as _sdkDesignations from '@abuddy/sdk/designations';
// @ts-expect-error — resolved by esbuild, not tsc
import * as _sdkInference from '@abuddy/sdk/inference';
import * as _sdkTemplates from '@abuddy/sdk/runtime';

const SDK_BRIDGE: Record<string, any> = {
  '@abuddy/sdk': _sdkRoot,
  '@abuddy/sdk/ears': _sdkEars,
  '@abuddy/sdk/ears/internals': _sdkEarsInternals,
  '@abuddy/sdk/framework': _sdkFramework,
  '@abuddy/sdk/helpers': _sdkHelpers,
  '@abuddy/sdk/packs': _sdkPacks,
  '@abuddy/sdk/utils': _sdkUtils,
  '@abuddy/sdk/utils/pure': _sdkUtilsPure,
  '@abuddy/sdk/rpc': _sdkRpc,
  '@abuddy/sdk/ids': _sdkIds,
  '@abuddy/sdk/logger': _sdkLogger,
  '@abuddy/sdk/services': _sdkServices,
  '@abuddy/sdk/seed': _sdkSeed,
  '@abuddy/sdk/backup': _sdkBackup,
  '@abuddy/sdk/steps': _sdkSteps,
  '@abuddy/sdk/artifacts': _sdkArtifacts,
  '@abuddy/sdk/blocks': _sdkBlocks,
  '@abuddy/sdk/build': _sdkBuild,
  '@abuddy/sdk/types': _sdkTypes,
  '@abuddy/sdk/designations': _sdkDesignations,
  '@abuddy/sdk/inference': _sdkInference,
  '@abuddy/sdk/runtime': _sdkTemplates,
};

// @ts-ignore TS1343 — runtime is ESM despite CJS tsconfig
const _metaUrl: string = import.meta.url;
// Always use createRequire — esbuild's require shim is a Proxy without .cache
const esmRequire = Module.createRequire(_metaUrl);
const logger = createLogger('pack-loader');

let _hostSdkVersion: string | undefined;
function getHostSdkVersion(): string | undefined {
  if (_hostSdkVersion !== undefined) return _hostSdkVersion || undefined;
  try {
    const sdkEntry = esmRequire.resolve('@abuddy/sdk');
    _hostSdkVersion = findSdkVersion(path.dirname(sdkEntry)) ?? '';
  } catch { _hostSdkVersion = ''; }
  return _hostSdkVersion || undefined;
}

// Re-export discovery types and seed helpers for backward-compatible imports
export type { BuiltInPackInfo, PackManifest, PackPluginDefinition } from '@abuddy/sdk/packs';
export { discoverBuiltInPacks } from '@abuddy/sdk/packs';
export { computePackSeedHash, seedPackData } from './pack-seed';

// ── Built-in pack loading ────────────────────────────────────────────
// The loader map is provided by a virtual module generated at build time
// by the 'built-in-pack-loaders' esbuild plugin in tsup.config.ts. It
// discovers built-in packs (abuddy.json with builtIn: true) and generates
// dynamic import() expressions that esbuild can trace and bundle. tsc uses
// the module declaration below for types without following into pack source.
//
// To add a new built-in pack: drop an abuddy.json with builtIn: true and
// a src/__generated__/pack-entry.ts — the plugin picks it up automatically.

import builtInLoaders from 'virtual:built-in-pack-loaders';

const DEV_ENTRY_FILENAME = 'dev-entry.cjs';

let _builtInPackInfos: BuiltInPackInfo[] = [];
export function getBuiltInPackInfos(): BuiltInPackInfo[] { return _builtInPackInfos; }

export async function loadBuiltInPacks(packagesDir: string): Promise<BuiltInPackInfo[]> {
  const discovered = discoverBuiltInPacks(packagesDir);
  if (discovered.length === 0) {
    logger.warn('No built-in packs found in ' + packagesDir);
    return [];
  }
  const loaded: BuiltInPackInfo[] = [];
  for (const pack of discovered) {
    // Dev mode: load from CJS on disk (enables hot reload)
    if (process.env.NODE_ENV === 'development') {
      const devEntry = path.join(pack.dir, 'dist', DEV_ENTRY_FILENAME);
      if (fs.existsSync(devEntry)) {
        try {
          const mod = withHostResolution(() => esmRequire(devEntry));
          if (mod.registration) {
            mod.setCompiledDir?.(path.join(pack.dir, 'dist'));
            registerPack(mod.registration);
            loaded.push(pack);
            logger.info(`Loaded built-in pack (dev): ${pack.id}`);
            continue;
          }
        } catch (err) {
          logger.warn(`Dev entry failed for ${pack.id}, falling back to bundle:`, err as Error);
        }
      }
    }

    // Production / fallback: use the bundled virtual module loader
    const loader = builtInLoaders[pack.id];
    if (!loader) {
      logger.warn(`Built-in pack ${pack.id}: no loader in virtual:built-in-pack-loaders, skipping`);
      continue;
    }
    try {
      const mod = await loader();
      if (!mod.registration) {
        logger.warn(`Built-in pack ${pack.id}: no 'registration' export, skipping`);
        continue;
      }
      mod.setCompiledDir?.(path.join(pack.dir, 'dist'));
      registerPack(mod.registration);
      loaded.push(pack);
      logger.info(`Loaded built-in pack: ${pack.id}`);
    } catch (err) {
      logger.error(`Failed to load built-in pack ${pack.id}:`, err as Error);
    }
  }
  _builtInPackInfos = loaded;
  return loaded;
}

// ── External pack loading ────────────────────────────────────────────

const HOST_PROVIDED_PACKAGES = getSharedBeDeps();

export interface LoadedPack {
  manifest: import('@abuddy/sdk/packs').PackManifest;
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

export function withHostResolution<T>(fn: () => T): T {
  const originalResolve = (Module as any)._resolveFilename;

  const hostResolutions = new Map<string, string>();
  for (const pkg of HOST_PROVIDED_PACKAGES) {
    try { hostResolutions.set(pkg, esmRequire.resolve(pkg)); } catch {}
  }

  // Pre-populate esmRequire.cache so SDK requires get the bundled singletons.
  // These persist — lazy requires inside pack callbacks need them too.
  // Cache entries are injected at both the bridge key (used while the
  // _resolveFilename patch is active) and the real resolved path (used by
  // lazy __esm() initializers that run after withHostResolution returns).
  for (const [specifier, exports] of Object.entries(SDK_BRIDGE)) {
    const cacheKey = `__sdk_bridge__/${specifier}`;
    if (!esmRequire.cache[cacheKey]) {
      const entry = { id: cacheKey, filename: cacheKey, loaded: true, exports, children: [], paths: [] } as any;
      esmRequire.cache[cacheKey] = entry;
      try {
        const realPath = esmRequire.resolve(specifier);
        if (!esmRequire.cache[realPath]) {
          esmRequire.cache[realPath] = entry;
        }
      } catch {}
    }
  }

  try {
    (Module as any)._resolveFilename = function (request: string, ...args: any[]) {
      if (SDK_BRIDGE[request]) {
        return `__sdk_bridge__/${request}`;
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
  featureId: string,
): { machine: import('xstate').AnyStateMachine; events: Set<string> } | null {
  const compiledPath = path.resolve(packDir, 'dist', 'systems', `${featureId}.cjs`);
  const fullPath = fs.existsSync(compiledPath)
    ? compiledPath
    : path.resolve(packDir, entry);

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
      const raw = mod.default || mod.system || mod.machine;
      if (!raw) {
        logger.warn(`No machine export found in ${entry}`);
        return null;
      }
      // Unwrap SystemEntry pattern ({ spec, machine }) if present
      const machine = raw.machine ?? raw;
      return { machine, events: new Set<string>(machine.events || []) };
    });
  } catch (err) {
    logger.error(`Failed to load system from ${entry}:`, err as Error);
    return null;
  }
}

export function loadSingleExternalPack(
  manifest: import('@abuddy/sdk/packs').PackManifest,
  dir: string,
): LoadedPack | null {
  if (manifest.hostVersion) {
    const minVersion = manifest.hostVersion.replace(/^>=?\s*/, '');
    if (compareVersions(APP_VERSION, minVersion) < 0) {
      logger.warn(`Skipping ${manifest.id}: requires host ${manifest.hostVersion}, running ${APP_VERSION}`);
      return null;
    }
  }

  const snapshotPath = path.join(dir, 'dist', 'snapshot.json');
  if (fs.existsSync(snapshotPath)) {
    try {
      const snapshot: PackSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
      const hostSdk = getHostSdkVersion();
      if (snapshot.sdkVersion && hostSdk) {
        const packMajor = snapshot.sdkVersion.split('.')[0];
        const hostMajor = hostSdk.split('.')[0];
        if (packMajor !== hostMajor) {
          logger.warn(
            `Pack ${manifest.id} was built with SDK v${snapshot.sdkVersion} but host is v${hostSdk} (major version mismatch)`,
          );
        }
      }
    } catch {}
  }

  const systems = new Map<string, { machine: import('xstate').AnyStateMachine; events: Set<string> }>();

  const pluginEntries = manifest.plugins ?? manifest.features;
  if (pluginEntries) {
    for (const plugin of pluginEntries) {
      if (!plugin.system?.entry) continue;

      const system = loadSystemFromCJS(plugin.system.entry, dir, plugin.id);
      if (system) {
        if ('events' in (plugin.system as Record<string, unknown>) && (plugin.system as any).events?.incoming) {
          for (const evt of (plugin.system as any).events.incoming) {
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

  return pack;
}

export function clearPackRequireCache(packDir: string): void {
  const prefix = packDir + path.sep;
  for (const key of Object.keys(esmRequire.cache)) {
    if (key.startsWith(prefix)) {
      delete esmRequire.cache[key];
    }
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
    const pack = loadSingleExternalPack(manifest, dir);
    if (pack) loaded.push(pack);
  }

  return loaded;
}

export function registerExternalPacks(packs: LoadedPack[]): LoadedPack[] {
  const registered: LoadedPack[] = [];
  for (const pack of packs) {
    const systems = Array.from(pack.systems.entries()).map(([featureId, sys]) => {
      const entries = pack.manifest.plugins ?? pack.manifest.features;
      const pluginDef = entries?.find(p => p.id === featureId);
      return {
        id: `${pack.manifest.id}.${featureId}`,
        machine: sys.machine,
        events: sys.events,
        designation: pluginDef?.designation,
      };
    });
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
