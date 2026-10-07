import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext, getAppVersion } from '@abuddy/sdk/env';
import type { PackSnapshot } from '@abuddy/sdk/build';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { packSystemIds, type PackRegistry, type PackOrigin } from '../registry.ts';
import { discoverPacks, discoveredPackIds, enabledExternalPacks, type PackManifest } from '../discovery.ts';
import { disabledPackIds, forgetPacksExcept } from '../installed.ts';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION, buildFormatProblem, isPackLayout, readPackIntegrity } from '../layout.ts';
import { isHostCompatible } from '../installer.ts';
import { packLoadFailed, packRegistered } from '../load-messages.ts';
import { findSdkVersion } from '../../build/shared-deps.ts';
import { withHostResolution } from './bridge.ts';

// Always use createRequire — esbuild's require shim is a Proxy without .cache
const esmRequire = Module.createRequire(import.meta.url);
const logger = createLogger('pack-loader');

/**
 * An external pack the loader read: what its bundle registered, and where the app found it.
 *
 * The registration is the pack's own object, passed to the registry as it is, never flattened into this type
 * field by field: a hand-written copy of its fields drops whichever one it was written before.
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

/** A pack's runtime module, as its built `runtime/index.cjs` exports it */
export interface PackRuntimeModule {
  registration?: PackRegistration;
  setCompiledDir?: (dir: string) => void;
}

/** Why the loader didn't load an installed pack, said as the Packs view shows it after "Failed to load:" */
export interface PackLoadProblem {
  problem: string;
}

/** Where the loader records why it skipped a pack: the app's registry, which the Packs view reads it from */
export type LoadProblemSink = Pick<PackRegistry, 'recordLoadProblem'>;

function skipped(manifest: PackManifest, problem: string): PackLoadProblem {
  logger.warn(`Skipping ${manifest.id}: ${problem}`);
  return { problem };
}

/** Reads an installed pack and its runtime, or says why it can't be loaded */
export function loadSingleExternalPack(
  manifest: PackManifest,
  dir: string,
  shippedIds: ReadonlySet<string> = new Set(),
): LoadedPack | PackLoadProblem {
  // The same semver check the installer applies, so any range a pack declares is honored
  const appVersion = getAppVersion();
  if (!isHostCompatible(manifest.hostVersion, appVersion)) {
    return skipped(manifest, `requires host ${manifest.hostVersion}, running ${appVersion}`);
  }

  const runtimeEntry = path.join(dir, PACK_LAYOUT.runtimeEntry);
  if (!isPackLayout(dir) || !fs.existsSync(runtimeEntry)) {
    return skipped(manifest, `${dir} isn't an installed pack (no ${PACK_LAYOUT.integrity} or ${PACK_LAYOUT.runtimeEntry}). Install it with abuddy install or abuddy run`);
  }
  try {
    const integrity = readPackIntegrity(dir);
    if (Math.floor(integrity.formatVersion) !== PACK_LAYOUT_VERSION) {
      return skipped(manifest, `pack layout format ${integrity.formatVersion} is not supported (host supports ${PACK_LAYOUT_VERSION})`);
    }
  } catch (err) {
    logger.warn(`Skipping ${manifest.id}: unreadable ${PACK_LAYOUT.integrity}`, err as Error);
    return { problem: `unreadable ${PACK_LAYOUT.integrity}: ${(err as Error).message}` };
  }

  // Before its runtime is loaded: a registration another abuddy built fails in ways that name nothing the author can act on
  const formatProblem = buildFormatProblem(dir);
  if (formatProblem) return skipped(manifest, formatProblem);

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
  if ('problem' in registration) return registration;

  // The one thing the app adds to what a pack registered: the entity types its manifest declares, for a
  // pack whose registration names none. Written onto the pack module's own object, which is safe only
  // because it is the same value every load — nothing is *taken off* a registration any more
  if (!registration.ears && (manifest.entities || manifest.relKinds)) {
    registration.ears = { entities: manifest.entities ?? {}, relKinds: manifest.relKinds ?? {} };
  }

  return {
    registration,
    origin: { id: manifest.id, name: manifest.name, version: manifest.version, dir, shipped: shippedIds.has(manifest.id), manifest },
  };
}

/**
 * The pack's own registration from its runtime bundle, as the pack built it: `abuddy build` already put the
 * events the manifest adds into each system's `receives`, and the registry derives every ref from the feature ids.
 */
function loadBundledRuntime(
  manifest: PackManifest,
  dir: string,
  runtimeEntry: string,
): PackRegistration | PackLoadProblem {
  let registration: PackRegistration;
  try {
    registration = withHostResolution(() => {
      const mod = esmRequire(runtimeEntry);
      mod.setCompiledDir?.(path.join(dir, PACK_LAYOUT.seedsDir));
      return mod.registration;
    });
  } catch (err) {
    logger.error(`Failed to load ${manifest.id} runtime (${PACK_LAYOUT.runtimeEntry}): ${(err as Error).message}`, err as Error);
    return { problem: `its runtime (${PACK_LAYOUT.runtimeEntry}) threw: ${(err as Error).message}` };
  }
  if (!registration) {
    const problem = `${PACK_LAYOUT.runtimeEntry} does not export \`registration\``;
    logger.error(`Pack ${manifest.id}: ${problem}`);
    return { problem };
  }
  if (registration.id !== manifest.id) {
    const problem = `runtime registration id "${registration.id}" does not match its manifest`;
    logger.error(`Pack ${manifest.id}: ${problem}`);
    return { problem };
  }

  return { ...registration };
}

export function clearPackRequireCache(packDir: string): void {
  const prefix = packDir + path.sep;
  for (const key of Object.keys(esmRequire.cache)) {
    if (key.startsWith(prefix)) {
      delete esmRequire.cache[key];
    }
  }
}

/**
 * Reads every enabled installed pack. Why each one it skips was skipped goes to `problems` when given: the app passes
 * its registry, so the Packs view can say why an enabled pack isn't running.
 */
export function loadExternalPacks(problems?: LoadProblemSink, shippedIds: ReadonlySet<string> = new Set()): LoadedPack[] {
  const { packsDir } = resolveAppContext();
  const discovered = discoverPacks(packsDir);
  // Boot is where what is installed is settled, so it is where rows for packs that are gone are dropped
  forgetPacksExcept(discoveredPackIds(discovered));
  // **The packs this app ships load first, and that is a guarantee rather than an accident of readdir.**
  // Registration order decides who wins a designation or a plugin id, so an installed pack that claimed
  // `brain` would take it from the pack the app needs if it happened to be discovered first. Two separate
  // load calls used to make this ordering structural; with one list it has to be said.
  const enabled = enabledExternalPacks(discovered, disabledPackIds())
    .sort((a, b) => Number(shippedIds.has(b.manifest.id)) - Number(shippedIds.has(a.manifest.id)));

  if (enabled.length === 0) return [];

  logger.info(`Loading ${enabled.length} pack(s)`);
  const loaded: LoadedPack[] = [];

  for (const { manifest, dir } of enabled) {
    const pack = loadSingleExternalPack(manifest, dir, shippedIds);
    if ('problem' in pack) problems?.recordLoadProblem(manifest.id, pack.problem);
    else loaded.push(pack);
  }

  return loaded;
}

/**
 * Registers each loaded external pack in `registry`, its systems as `<packId>/<featureId>`; returns those registered.
 * A pack the registry refuses has why recorded there as its load problem.
 */
export function registerExternalPacks(registry: PackRegistry, packs: LoadedPack[]): LoadedPack[] {
  const registered: LoadedPack[] = [];
  for (const pack of packs) {
    try {
      registry.registerPack(pack.registration, pack.origin);
      registered.push(pack);
      logger.info(packRegistered(pack.origin.id, packSystemIds(pack.registration).length));
    } catch (err) {
      logger.error(`${packLoadFailed(pack.origin.id)}:`, err as Error);
      registry.recordLoadProblem(pack.origin.id, `its registration was refused: ${(err as Error).message}`);
    }
  }
  return registered;
}

/**
 * Loads the app's packs into `registry` — every pack, by the one path, from its own installed directory.
 *
 * The packs in `shippedIds` are ordered first, so a role one of them designates can't be taken by a pack
 * installed later that designates it too: the shipped pack would then fail to register at all. That is the
 * whole of what shipping buys a pack here, and it is an argument rather than something read off a manifest.
 */
export function loadAppPacks(registry: PackRegistry, shippedIds: ReadonlySet<string> = new Set()): { loaded: LoadedPack[] } {
  const loaded = loadExternalPacks(registry, shippedIds);
  return { loaded: loaded.length > 0 ? registerExternalPacks(registry, loaded) : [] };
}
