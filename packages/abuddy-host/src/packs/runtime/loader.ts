import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext, getAppVersion } from '@abuddy/sdk/env';
import type { PackSnapshot } from '@abuddy/sdk/build';
import type { PackRegistration } from '@abuddy/sdk/framework';
import type { PackRegistry } from '../pack-registration.ts';
import { discoverBuiltInPacks, discoverPacks, reconcileInstalledPacks, type BuiltInPackInfo, type PackManifest } from '../pack-discovery.ts';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION, isPackLayout, readPackIntegrity } from '../pack-layout.ts';
import { isHostCompatible } from '../pack-installer.ts';
import { findSdkVersion } from '../../build/shared-deps.ts';
import { withHostResolution } from './bridge.ts';
import { getBuiltInPackInfos, setBuiltInPackInfos, type LoadedPack } from './loaded-packs.ts';

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

/** The app bundle's loaders for its built-in packs, by pack id (the API's virtual:built-in-pack-loaders) */
export type BundledPackLoaders = Record<string, () => Promise<BuiltInRuntime>>;

/** A built-in pack's built backend runtime (dist/runtime/index.cjs, the bundle layout's runtime entry) */
export function builtInRuntimeEntry(packDir: string): string {
  return path.join(packDir, 'dist', PACK_LAYOUT.runtimeEntry);
}

/** A built-in pack's runtime module, as its built entry exports it */
export interface BuiltInRuntime {
  registration?: PackRegistration;
  setCompiledDir?: (dir: string) => void;
}

/**
 * The registration of a built-in pack's module, with the module pointed at the compiled seed data in
 * its dist/ first: its seeders, settings defaults and FAQs read from there. Callers get the
 * registration and never the module, so no load can skip this — a reload requires the entry afresh,
 * and the new module starts without the directory.
 */
function packRegistration(mod: BuiltInRuntime, packDir: string): PackRegistration | undefined {
  mod.setCompiledDir?.(path.join(packDir, 'dist'));
  return mod.registration;
}

/** Loads a built-in pack's built runtime (dist/runtime/index.cjs) from disk and returns its registration */
export function loadBuiltInRuntime(packDir: string): PackRegistration | undefined {
  return packRegistration(withHostResolution(() => esmRequire(builtInRuntimeEntry(packDir))), packDir);
}


/** Re-reads a loaded built-in pack's manifest, so a name or version a rebuild changed is the one listed */
export function refreshBuiltInPackInfo(packId: string): void {
  const info = getBuiltInPackInfos().find(p => p.id === packId);
  if (!info) return;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(info.dir, PACK_LAYOUT.manifest), 'utf-8')) as { name?: string; version?: string };
    if (manifest.name) info.name = manifest.name;
    if (manifest.version) info.version = manifest.version;
  } catch (err) {
    logger.warn(`Built-in pack ${packId}: could not re-read its manifest`, err as Error);
  }
}

export interface LoadBuiltInPacksOptions {
  /**
   * `prefer` (default in development) loads each pack's built runtime (dist/runtime/index.cjs) when it
   * exists and falls back to the bundled loaders; `never` (default otherwise) uses only the bundled
   * loaders; `only` requires the built runtime (unbundled tools, which have no bundled loaders).
   */
  runtimeEntry?: 'prefer' | 'only' | 'never';
  /** The app bundle's loaders, imported when first needed: required for `never`, and for `prefer` once it falls back */
  bundledLoaders?: () => Promise<BundledPackLoaders>;
}

/** Loads the built-in packs in `packagesDir` and registers each in `registry` */
export async function loadBuiltInPacks(
  registry: PackRegistry,
  packagesDir: string,
  { runtimeEntry = process.env.NODE_ENV === 'development' ? 'prefer' : 'never', bundledLoaders }: LoadBuiltInPacksOptions = {},
): Promise<BuiltInPackInfo[]> {
  const missingLoaders = () => new Error(`loadBuiltInPacks: runtimeEntry '${runtimeEntry}' needs the bundledLoaders option to load ${runtimeEntry === 'never' ? 'packs' : 'a pack without a built runtime'}`);
  if (runtimeEntry === 'never' && !bundledLoaders) throw missingLoaders();
  let loaders: BundledPackLoaders | undefined;
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
            registry.registerPack(registration);
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

    // The app bundle's loader: always when packaged, or when a built runtime is missing or failed
    if (!bundledLoaders) throw missingLoaders();
    loaders ??= await bundledLoaders();
    const loader = loaders[pack.id];
    if (!loader) {
      logger.warn(`Built-in pack ${pack.id}: no bundled loader, skipping`);
      continue;
    }
    try {
      const registration = packRegistration(await loader(), pack.dir);
      if (!registration) {
        logger.warn(`Built-in pack ${pack.id}: no 'registration' export, skipping`);
        continue;
      }
      registry.registerPack(registration);
      loaded.push(pack);
      logger.info(`Loaded built-in pack: ${pack.id}`);
    } catch (err) {
      logger.error(`Failed to load built-in pack ${pack.id}:`, err as Error);
    }
  }
  setBuiltInPackInfos(loaded);
  return loaded;
}

// ── External pack loading ────────────────────────────────────────────


export function loadSingleExternalPack(
  manifest: PackManifest,
  dir: string,
): LoadedPack | null {
  // The same semver check the installer applies, so any range a pack declares is honored
  const appVersion = getAppVersion();
  if (!isHostCompatible(manifest.hostVersion, appVersion)) {
    logger.warn(`Skipping ${manifest.id}: requires host ${manifest.hostVersion}, running ${appVersion}`);
    return null;
  }

  const runtimeEntry = path.join(dir, PACK_LAYOUT.runtimeEntry);
  if (!isPackLayout(dir) || !fs.existsSync(runtimeEntry)) {
    logger.warn(`Skipping ${manifest.id}: ${dir} isn't an installed pack (no ${PACK_LAYOUT.info} or ${PACK_LAYOUT.runtimeEntry}). Install it with abuddy install or abuddy dev`);
    return null;
  }
  try {
    const info = readPackIntegrity(dir);
    if (Math.floor(info.formatVersion) !== PACK_LAYOUT_VERSION) {
      logger.warn(`Skipping ${manifest.id}: bundle format ${info.formatVersion} is not supported (host supports ${PACK_LAYOUT_VERSION})`);
      return null;
    }
  } catch (err) {
    logger.warn(`Skipping ${manifest.id}: unreadable ${PACK_LAYOUT.info}`, err as Error);
    return null;
  }

  const snapshotPath = path.join(dir, PACK_LAYOUT.snapshot);
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
  manifest: PackManifest,
  dir: string,
  runtimeEntry: string,
): LoadedPack | null {
  let registration: PackRegistration;
  try {
    registration = withHostResolution(() => {
      const mod = esmRequire(runtimeEntry);
      mod.setCompiledDir?.(path.join(dir, PACK_LAYOUT.seedsDir));
      return mod.registration;
    });
  } catch (err) {
    logger.error(`Failed to load ${manifest.id} runtime (${PACK_LAYOUT.runtimeEntry}): ${(err as Error).message}`, err as Error);
    return null;
  }
  if (!registration) {
    logger.error(`Pack ${manifest.id}: ${PACK_LAYOUT.runtimeEntry} does not export \`registration\``);
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
    repositories: registration.repositories,
    boot: registration.boot ? { ...registration.boot } : undefined,
    migrations: registration.migrations,
    seedHooks: registration.seedHooks,
    seeders: registration.seeders,
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
  const enabled = reconcileInstalledPacks(discovered);

  if (enabled.length === 0) return [];

  logger.info(`Loading ${enabled.length} external pack(s)`);
  const loaded: LoadedPack[] = [];

  for (const { manifest, dir } of enabled) {
    const pack = loadSingleExternalPack(manifest, dir);
    if (pack) loaded.push(pack);
  }

  return loaded;
}

/** Registers each loaded external pack in `registry`, its systems as `<packId>.<featureId>`; returns those registered */
export function registerExternalPacks(registry: PackRegistry, packs: LoadedPack[]): LoadedPack[] {
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
      registry.registerPack({
        id: pack.manifest.id,
        systems,
        services: pack.services,
        steps: pack.steps,
        artifacts: pack.artifacts,
        blocks: pack.blocks,
        ears: pack.ears,
        repositories: pack.repositories,
        boot: pack.boot,
        migrations: pack.migrations,
        seedHooks: pack.seedHooks,
        seeders: pack.seeders,
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
