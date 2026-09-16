import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';
import { createLogger } from '@/core/shared/debug/logger';
import { APP_VERSION } from '@/version';
import {
  registerPack,
  discoverBuiltInPacks,
  type BuiltInPackInfo,
  discoverPacks,
  reconcileExternalRegistry,
  BUNDLE_PATHS,
  BUNDLE_FORMAT_VERSION,
  isBundleDir,
  readBundleInfo,
  isHostCompatible,
  withModuleBridge,
} from '@abuddy/host/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { PackSnapshot } from '@abuddy/sdk/build';
import { getSharedBeDeps, findSdkVersion } from '@abuddy/host/build/shared-deps';

// ── SDK bridge ──────────────────────────────────────────────────────
// The API bundle inlines @abuddy/sdk and @abuddy/host (tsup bundles them). Any CJS code
// loaded at runtime (external packs, built-in dev entry) that does
// require('@abuddy/sdk/ears') would get a SEPARATE module instance
// with empty singleton state (Maps, registries). These static imports
// resolve to the BUNDLED instances — the ones with hydrated data.
// withHostResolution injects them into esmRequire.cache so dynamically
// loaded pack code shares the real singletons.
import * as _sdkRoot from '@abuddy/sdk';
import * as _sdkEars from '@abuddy/sdk/ears';
import * as _sdkFramework from '@abuddy/sdk/framework';
import * as _sdkHelpers from '@abuddy/sdk/helpers';
import * as _sdkUtils from '@abuddy/sdk/utils';
import * as _sdkUtilsPure from '@abuddy/sdk/utils/pure';
import * as _sdkRpc from '@abuddy/sdk/rpc';
import * as _sdkIds from '@abuddy/sdk/ids';
import * as _sdkLogger from '@abuddy/sdk/logger';
import * as _sdkServices from '@abuddy/sdk/services';
import * as _sdkSeed from '@abuddy/sdk/seed';
import * as _sdkSteps from '@abuddy/sdk/steps';
import * as _sdkArtifacts from '@abuddy/sdk/artifacts';
import * as _sdkBlocks from '@abuddy/sdk/blocks';
import * as _sdkBuild from '@abuddy/sdk/build';
import * as _sdkTypes from '@abuddy/sdk/types';
import * as _sdkDesignations from '@abuddy/sdk/designations';
import * as _sdkEnv from '@abuddy/sdk/env';
import * as _sdkModels from '@abuddy/sdk/models';
import * as _sdkTemplates from '@abuddy/sdk/runtime';
import * as _sdkCron from '@abuddy/sdk/cron';
import * as _sdkCompareVersions from '@abuddy/sdk/utils/compare-versions';
// Built-in packs also use host-only modules
import * as _hostEars from '@abuddy/host/ears';
import * as _hostPacks from '@abuddy/host/packs';
import * as _hostPersistence from '@abuddy/host/persistence';
import * as _hostBackup from '@abuddy/host/backup';

const SDK_BRIDGE: Record<string, any> = {
  '@abuddy/sdk': _sdkRoot,
  '@abuddy/sdk/ears': _sdkEars,
  '@abuddy/sdk/framework': _sdkFramework,
  '@abuddy/sdk/helpers': _sdkHelpers,
  '@abuddy/sdk/utils': _sdkUtils,
  '@abuddy/sdk/utils/pure': _sdkUtilsPure,
  '@abuddy/sdk/rpc': _sdkRpc,
  '@abuddy/sdk/ids': _sdkIds,
  '@abuddy/sdk/logger': _sdkLogger,
  '@abuddy/sdk/services': _sdkServices,
  '@abuddy/sdk/seed': _sdkSeed,
  '@abuddy/sdk/steps': _sdkSteps,
  '@abuddy/sdk/artifacts': _sdkArtifacts,
  '@abuddy/sdk/blocks': _sdkBlocks,
  '@abuddy/sdk/build': _sdkBuild,
  '@abuddy/sdk/types': _sdkTypes,
  '@abuddy/sdk/designations': _sdkDesignations,
  '@abuddy/sdk/env': _sdkEnv,
  '@abuddy/sdk/models': _sdkModels,
  '@abuddy/sdk/runtime': _sdkTemplates,
  // Leaf modules too: an installed pack has no node_modules to resolve them from
  '@abuddy/sdk/cron': _sdkCron,
  '@abuddy/sdk/utils/compare-versions': _sdkCompareVersions,
  '@abuddy/host/ears': _hostEars,
  '@abuddy/host/packs': _hostPacks,
  '@abuddy/host/persistence': _hostPersistence,
  '@abuddy/host/backup': _hostBackup,
};

/**
 * The @abuddy/sdk and @abuddy/host specifiers bridged to host singletons.
 *
 * Exported for the drift guard in tests/unit/sdk-bridge-drift.spec.ts. A pack
 * importing an @abuddy/sdk subpath that is missing here does NOT fail loudly:
 * the require falls through to real Node resolution, which type-strips the
 * SDK's .ts source and then dies on its extensionless relative imports
 * (ERR_MODULE_NOT_FOUND). loadBuiltInPacks catches that and silently falls
 * back to the prebuilt bundle, so the app still boots with dev hot-reload
 * quietly broken. The guard makes a new SDK export fail a test instead.
 */
export function getBridgedSdkSpecifiers(): readonly string[] {
  return Object.keys(SDK_BRIDGE);
}

// Always use createRequire — esbuild's require shim is a Proxy without .cache
const esmRequire = Module.createRequire(import.meta.url);
const logger = createLogger('pack-loader');

let _hostSdkVersion: string | undefined;
function getHostSdkVersion(): string | undefined {
  if (_hostSdkVersion !== undefined) return _hostSdkVersion || undefined;
  try {
    const sdkEntry = esmRequire.resolve('@abuddy/sdk/package.json');
    _hostSdkVersion = findSdkVersion(path.dirname(sdkEntry)) ?? '';
  } catch { _hostSdkVersion = ''; }
  return _hostSdkVersion || undefined;
}

// ── Built-in pack loading ────────────────────────────────────────────
// The loader map is provided by a virtual module generated at build time
// by the 'built-in-pack-loaders' esbuild plugin in tsup.config.ts. It
// discovers built-in packs (abuddy.json with builtIn: true) and generates
// dynamic import() expressions that esbuild can trace and bundle. tsc uses
// the module declaration below for types without following into pack source.
//
// To add a new built-in pack: drop an abuddy.json with builtIn: true and
// a src/__generated__/pack-entry.ts — the plugin picks it up automatically.

// Imported when needed, so tools that run the API's modules unbundled (db scripts) can load
// built-in packs from their dev entries instead
const loadBuiltInLoaders = async () => (await import('virtual:built-in-pack-loaders')).default;

/** A built-in pack's built backend runtime (dist/runtime/index.cjs, the bundle layout's runtime entry) */
export function builtInRuntimeEntry(packDir: string): string {
  return path.join(packDir, 'dist', BUNDLE_PATHS.runtimeEntry);
}

/** A built-in pack's runtime module, as its built entry exports it */
interface BuiltInRuntime {
  registration?: import('@abuddy/sdk/framework').PackRegistration;
  setCompiledDir?: (dir: string) => void;
}

/**
 * The registration of a built-in pack's module, with the module pointed at the compiled seed data in
 * its dist/ first: its seeders, settings defaults and FAQs read from there. Callers get the
 * registration and never the module, so no load can skip this — a reload requires the entry afresh,
 * and the new module starts without the directory.
 */
function packRegistration(mod: BuiltInRuntime, packDir: string): import('@abuddy/sdk/framework').PackRegistration | undefined {
  mod.setCompiledDir?.(path.join(packDir, 'dist'));
  return mod.registration;
}

/** Loads a built-in pack's built runtime (dist/runtime/index.cjs) from disk and returns its registration */
export function loadBuiltInRuntime(packDir: string): import('@abuddy/sdk/framework').PackRegistration | undefined {
  return packRegistration(withHostResolution(() => esmRequire(builtInRuntimeEntry(packDir))), packDir);
}

let _builtInPackInfos: BuiltInPackInfo[] = [];
export function getBuiltInPackInfos(): BuiltInPackInfo[] { return _builtInPackInfos; }

/** Re-reads a loaded built-in pack's manifest, so a name or version a rebuild changed is the one listed */
export function refreshBuiltInPackInfo(packId: string): void {
  const info = _builtInPackInfos.find(p => p.id === packId);
  if (!info) return;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(info.dir, BUNDLE_PATHS.manifest), 'utf-8')) as { name?: string; version?: string };
    if (manifest.name) info.name = manifest.name;
    if (manifest.version) info.version = manifest.version;
  } catch (err) {
    logger.warn(`Built-in pack ${packId}: could not re-read its manifest`, err as Error);
  }
}

export interface LoadBuiltInPacksOptions {
  /**
   * `prefer` (default in development) loads each pack's built runtime (dist/runtime/index.cjs) when it
   * exists and falls back to the bundled loaders; `only` requires it (unbundled tools, which have no
   * bundled loaders).
   */
  runtimeEntry?: 'prefer' | 'only' | 'never';
}

export async function loadBuiltInPacks(
  packagesDir: string,
  { runtimeEntry = process.env.NODE_ENV === 'development' ? 'prefer' : 'never' }: LoadBuiltInPacksOptions = {},
): Promise<BuiltInPackInfo[]> {
  const discovered = discoverBuiltInPacks(packagesDir);
  if (discovered.length === 0) {
    logger.warn('No built-in packs found in ' + packagesDir);
    return [];
  }
  const loaded: BuiltInPackInfo[] = [];
  for (const pack of discovered) {
    // Dev mode: load the built runtime from disk (enables hot reload)
    if (runtimeEntry !== 'never') {
      const runtimeEntryPath = builtInRuntimeEntry(pack.dir);
      if (runtimeEntry === 'only' && !fs.existsSync(runtimeEntryPath)) {
        throw new Error(`Built-in pack ${pack.id} has no ${path.relative(packagesDir, runtimeEntryPath)}. Run: npm run build -w @app/default-setup`);
      }
      if (fs.existsSync(runtimeEntryPath)) {
        try {
          const registration = loadBuiltInRuntime(pack.dir);
          if (registration) {
            registerPack(registration);
            loaded.push(pack);
            logger.info(`Loaded built-in pack (dev): ${pack.id}`);
            continue;
          }
        } catch (err) {
          if (runtimeEntry === 'only') throw err;
          logger.warn(`Built runtime failed for ${pack.id}, falling back to the bundled loader:`, err as Error);
        }
      }
    }

    // Production / fallback: use the bundled virtual module loader
    const loader = (await loadBuiltInLoaders())[pack.id];
    if (!loader) {
      logger.warn(`Built-in pack ${pack.id}: no loader in virtual:built-in-pack-loaders, skipping`);
      continue;
    }
    try {
      const registration = packRegistration(await loader(), pack.dir);
      if (!registration) {
        logger.warn(`Built-in pack ${pack.id}: no 'registration' export, skipping`);
        continue;
      }
      registerPack(registration);
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
  manifest: import('@abuddy/host/packs').PackManifest;
  dir: string;
  systems: Map<string, { machine: import('xstate').AnyStateMachine; events: Set<string> }>;
  services?: Record<string, unknown>;
  steps?: import('@abuddy/sdk/steps').StepDefinition[];
  artifacts?: import('@abuddy/sdk/artifacts').ArtifactDefinition[];
  blocks?: import('@abuddy/sdk/blocks').BlockDefinition[];
  ears?: import('@abuddy/sdk/framework').PackEARS;
  boot?: import('@abuddy/sdk/framework').PackBootHooks;
  migrations?: import('@abuddy/sdk/framework').PackMigration[];
  seedHooks?: import('@abuddy/sdk/framework').PackRegistration['seedHooks'];
  /** The slash commands the pack declares (abuddy.json `commands`) */
  commands?: import('@abuddy/sdk/framework').PackRegistration['commands'];
  /** Feature definitions, with each feature's default settings */
  features?: import('@abuddy/sdk/framework').PackFeatureDef[];
}

/** Runs `fn` (a require of pack runtime code) with @abuddy/sdk bridged to the API's instances and host-provided packages resolved from the API */
export function withHostResolution<T>(fn: () => T): T {
  return withModuleBridge({ modules: SDK_BRIDGE, hostPackages: HOST_PROVIDED_PACKAGES, resolveFrom: import.meta.url }, fn);
}

export function loadSingleExternalPack(
  manifest: import('@abuddy/host/packs').PackManifest,
  dir: string,
): LoadedPack | null {
  // The same semver check the installer applies, so any range a pack declares is honored
  if (!isHostCompatible(manifest.hostVersion, APP_VERSION)) {
    logger.warn(`Skipping ${manifest.id}: requires host ${manifest.hostVersion}, running ${APP_VERSION}`);
    return null;
  }

  const runtimeEntry = path.join(dir, BUNDLE_PATHS.runtimeEntry);
  if (!isBundleDir(dir) || !fs.existsSync(runtimeEntry)) {
    logger.warn(`Skipping ${manifest.id}: ${dir} isn't an installed pack bundle (no ${BUNDLE_PATHS.info} or ${BUNDLE_PATHS.runtimeEntry}). Install it with abuddy install or abuddy dev`);
    return null;
  }
  try {
    const info = readBundleInfo(dir);
    if (Math.floor(info.formatVersion) !== BUNDLE_FORMAT_VERSION) {
      logger.warn(`Skipping ${manifest.id}: bundle format ${info.formatVersion} is not supported (host supports ${BUNDLE_FORMAT_VERSION})`);
      return null;
    }
  } catch (err) {
    logger.warn(`Skipping ${manifest.id}: unreadable ${BUNDLE_PATHS.info}`, err as Error);
    return null;
  }

  const snapshotPath = path.join(dir, BUNDLE_PATHS.snapshot);
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

  const pack = loadBundledRuntime(manifest, dir, runtimeEntry);
  if (!pack) return null;

  if (!pack.ears && (manifest.entities || manifest.relKinds)) {
    pack.ears = { entities: manifest.entities ?? {}, relKinds: manifest.relKinds ?? {} };
  }

  if (pack.boot?.earlySystem) {
    logger.warn(`Pack ${manifest.id}: earlySystem blocked for external packs`);
    delete pack.boot.earlySystem;
  }
  // External pack seeds are hash-checked per pack by seedPackData(); the declarative
  // boot seed path tracks a single global hash and is reserved for built-in packs
  if (pack.boot?.seedManifest) delete pack.boot.seedManifest;
  const policy = pack.ears?.partitionPolicy;
  if (policy) {
    if ((policy.excludedEntityTypes?.length ?? 0) > 0) {
      logger.warn(`Pack ${manifest.id}: partitionPolicy ignored for external packs (v1)`);
    }
    delete pack.ears!.partitionPolicy;
  }

  return pack;
}

function loadBundledRuntime(
  manifest: import('@abuddy/host/packs').PackManifest,
  dir: string,
  runtimeEntry: string,
): LoadedPack | null {
  let registration: import('@abuddy/sdk/framework').PackRegistration;
  try {
    registration = withHostResolution(() => {
      const mod = esmRequire(runtimeEntry);
      mod.setCompiledDir?.(path.join(dir, BUNDLE_PATHS.seedsDir));
      return mod.registration;
    });
  } catch (err) {
    logger.error(`Failed to load ${manifest.id} runtime (${BUNDLE_PATHS.runtimeEntry}):`, err as Error);
    return null;
  }
  if (!registration) {
    logger.error(`Pack ${manifest.id}: ${BUNDLE_PATHS.runtimeEntry} does not export \`registration\``);
    return null;
  }
  if (registration.id !== manifest.id) {
    logger.error(`Pack ${manifest.id}: runtime registration id "${registration.id}" does not match its manifest`);
    return null;
  }

  const systems = new Map<string, { machine: import('xstate').AnyStateMachine; events: Set<string> }>();
  for (const def of registration.systems ?? []) {
    const feature = manifest.features?.find(f => f.id === def.id);
    const events = new Set<string>(def.events);
    for (const evt of feature?.system?.events?.incoming ?? []) events.add(evt);
    systems.set(def.id, { machine: def.machine, events });
    logger.info(`Loaded system: ${manifest.id}/${def.id}`);
  }

  return {
    manifest,
    dir,
    systems,
    services: registration.services,
    steps: registration.steps,
    artifacts: registration.artifacts,
    blocks: registration.blocks,
    ears: registration.ears,
    boot: registration.boot ? { ...registration.boot } : undefined,
    migrations: registration.migrations,
    seedHooks: registration.seedHooks,
    commands: registration.commands,
    features: registration.features,
  };
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
  const { packsDir } = resolveAppContext();
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
      const entries = pack.manifest.features;
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
        seedHooks: pack.seedHooks,
        commands: pack.commands,
        features: pack.features,
      });
      registered.push(pack);
      logger.info(`Registered pack: ${pack.manifest.id} (${systems.length} systems)`);
    } catch (err) {
      logger.error(`Failed to register pack ${pack.manifest.id}:`, err as Error);
    }
  }
  return registered;
}
