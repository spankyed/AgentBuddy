import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext, getAppVersion } from '@abuddy/sdk/env';
import type { PackSnapshot } from '@abuddy/sdk/build';
import type { PackRegistration } from '@abuddy/sdk/framework';
import type { PackRegistry, PackOrigin } from '../pack-registration.ts';
import type { AnyStateMachine } from 'xstate';
import type { PackBootHooks, PackEARS, PackFeatureDef, PackMigration } from '@abuddy/sdk/framework';
import type { StepDefinition } from '@abuddy/sdk/steps';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { discoverBuiltInPacks, discoverPacks, discoveredPackIds, enabledExternalPacks, type BuiltInPackInfo, type PackManifest } from '../pack-discovery.ts';
import { disabledPackIds, forgetPacksExcept } from '../installed-packs.ts';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION, isPackLayout, readPackIntegrity } from '../pack-layout.ts';
import { isHostCompatible } from '../pack-installer.ts';
import { packLoadFailed, packRegistered } from '../load-messages.ts';
import { findSdkVersion } from '../../build/shared-deps.ts';
import { withHostResolution } from './bridge.ts';

// Always use createRequire — esbuild's require shim is a Proxy without .cache
const esmRequire = Module.createRequire(import.meta.url);
const logger = createLogger('pack-loader');

/**
 * An external pack the loader read: what its bundle registered, and where the app found it.
 *
 * The registration is the pack's own object, passed to the registry as it is. It used to be flattened into
 * this type field by field and reassembled on the way out; the two hand-written field lists silently lost
 * `receivedEventTypes` when it was added to `PackRegistration`.
 */
export interface LoadedPack {
  registration: PackRegistration;
  origin: PackOrigin;
}


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

/** A built-in pack's built backend runtime (dist/runtime/index.cjs, the pack layout's runtime entry) */
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

/**
 * Re-reads a loaded built-in pack's manifest, so a name or version a rebuild changed is the one listed.
 * Updates the origin in place, as the list it replaced was updated in place.
 */
export function refreshBuiltInPackInfo(registry: PackRegistry, packId: string): void {
  const info = registry.packOrigin(packId);
  if (!info?.builtIn) return;
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
            registry.registerPack(registration, { ...pack, builtIn: true });
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
      registry.registerPack(registration, { ...pack, builtIn: true });
      loaded.push(pack);
      logger.info(`Loaded built-in pack: ${pack.id}`);
    } catch (err) {
      logger.error(`Failed to load built-in pack ${pack.id}:`, err as Error);
    }
  }
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
    logger.warn(`Skipping ${manifest.id}: ${dir} isn't an installed pack (no ${PACK_LAYOUT.integrity} or ${PACK_LAYOUT.runtimeEntry}). Install it with abuddy install or abuddy dev`);
    return null;
  }
  try {
    const integrity = readPackIntegrity(dir);
    if (Math.floor(integrity.formatVersion) !== PACK_LAYOUT_VERSION) {
      logger.warn(`Skipping ${manifest.id}: pack layout format ${integrity.formatVersion} is not supported (host supports ${PACK_LAYOUT_VERSION})`);
      return null;
    }
  } catch (err) {
    logger.warn(`Skipping ${manifest.id}: unreadable ${PACK_LAYOUT.integrity}`, err as Error);
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

  const registration = loadBundledRuntime(manifest, dir, runtimeEntry);
  if (!registration) return null;

  if (!registration.ears && (manifest.entities || manifest.relKinds)) {
    registration.ears = { entities: manifest.entities ?? {}, relKinds: manifest.relKinds ?? {} };
  }

  // `boot` and `ears` are the pack module's own objects; what the app refuses an external pack is taken off
  // a copy, so a reload that reuses the module sees what the pack exported rather than what the last load
  // left of it
  if (registration.boot?.earlySystem || registration.boot?.seedManifest) {
    registration.boot = { ...registration.boot };
    if (registration.boot.earlySystem) {
      logger.warn(`Pack ${manifest.id}: earlySystem blocked for external packs`);
      delete registration.boot.earlySystem;
    }
    // External pack seeds are hash-checked per pack by seedPackData(); the declarative
    // boot seed path tracks a single global hash and is reserved for built-in packs
    delete registration.boot.seedManifest;
  }
  const policy = registration.ears?.partitionPolicy;
  if (policy) {
    if ((policy.excludedEntityTypes?.length ?? 0) > 0) {
      logger.warn(`Pack ${manifest.id}: partitionPolicy ignored for external packs (v1)`);
    }
    registration.ears = { ...registration.ears! };
    delete registration.ears.partitionPolicy;
  }

  return {
    registration,
    origin: { id: manifest.id, name: manifest.name, version: manifest.version, dir, builtIn: false, manifest },
  };
}

/**
 * The pack's own registration from its runtime bundle, with its systems completed from the manifest: the
 * bus id (`<packId>.<featureId>`), the designation its feature declares, and the incoming events the
 * manifest adds to the ones the system declared. Completed here and not again: the registry takes the
 * object as it is.
 */
function loadBundledRuntime(
  manifest: PackManifest,
  dir: string,
  runtimeEntry: string,
): PackRegistration | null {
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

  const systems = (registration.systems ?? []).map((def) => {
    const feature = manifest.features?.find((f) => f.id === def.id);
    const events = new Set<string>(def.events);
    for (const evt of feature?.system?.events?.incoming ?? []) events.add(evt);
    logger.info(`Loaded system: ${manifest.id}/${def.id}`);
    return { id: `${manifest.id}.${def.id}`, machine: def.machine, events, designation: feature?.designation };
  });

  return { ...registration, systems };
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
  // Boot is where what is installed is settled, so it is where rows for packs that are gone are dropped
  forgetPacksExcept(discoveredPackIds(discovered));
  const enabled = enabledExternalPacks(discovered, disabledPackIds());

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
    try {
      registry.registerPack(pack.registration, pack.origin);
      registered.push(pack);
      logger.info(packRegistered(pack.origin.id, pack.registration.systems.length));
    } catch (err) {
      logger.error(`${packLoadFailed(pack.origin.id)}:`, err as Error);
    }
  }
  return registered;
}
