import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/core/shared/debug/logger';
import {
  registerPack,
  unregisterPack,
  getPackRegistration,
} from '@abuddy/host/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { PackSystemDef } from '@abuddy/sdk/framework';
import { registerShutdownHook, runShutdownHooksForKey } from '@abuddy/sdk/utils';
import { invalidateEventValidationMap } from '@/systems';
import { invalidatePartitionPolicy } from '@/core/ears/attribute-storage';
import Module from 'module';
import {
  loadSingleExternalPack,
  clearPackRequireCache,
  registerExternalPacks,
  getBuiltInPackInfos,
  builtInRuntimeEntry,
  withHostResolution,
} from './pack-loader';
import { seedPackData } from './pack-seed';
import { updateLoadedPack } from './pack-api';
import { seedData } from '@abuddy/sdk/utils';
import { settingsRepository } from '@abuddy/host/settings';
import type { PackManifest } from '@abuddy/host/packs';

const esmRequire = Module.createRequire(import.meta.url);

const logger = createLogger('pack-reload');

/** A pack's freshly loaded runtime, not yet registered */
interface FreshPack {
  newSystemIds: string[];
  /** Registers the fresh runtime; throws when the registration is refused */
  register(): void;
  onShutdown?: () => void;
  onInit?: () => void;
  afterRegister?: () => void;
}

/**
 * Replaces a running pack with its rebuilt runtime. The fresh runtime is loaded and registered before the
 * running one is shut down: if it fails to load, or its registration is refused, the running pack stays as
 * it was and the error is thrown.
 */
async function reloadPack(
  packId: string,
  backendActor: import('xstate').AnyActorRef,
  loadFresh: () => FreshPack,
  cacheDir: string,
): Promise<void> {
  const previous = getPackRegistration(packId);
  const oldSystemIds = previous?.systems.map(s => s.id) ?? [];

  logger.info(`Reloading pack: ${packId}`);

  // The running pack's modules stay live; only a fresh require loads the rebuilt ones
  clearPackRequireCache(cacheDir);
  const fresh = loadFresh();

  if (previous) unregisterPack(packId);
  else logger.info(`Pack ${packId} was not previously registered`);
  try {
    fresh.register();
  } catch (err) {
    if (previous) registerPack(previous);
    throw err;
  } finally {
    invalidateEventValidationMap();
    invalidatePartitionPolicy();
  }

  runShutdownHooksForKey(packId);
  if (fresh.onShutdown) {
    registerShutdownHook(fresh.onShutdown, packId);
  }
  fresh.onInit?.();
  fresh.afterRegister?.();

  // The bus stops each of these and starts those still registered: a feature the pack dropped only stops
  const systemIds = [...new Set([...oldSystemIds, ...fresh.newSystemIds])];

  backendActor.send({ type: 'RELOAD_PACK', packId, systemIds });

  logger.info(`Pack reloaded: ${packId} (${fresh.newSystemIds.length} systems)`);
}

export async function reloadExternalPack(
  packId: string,
  backendActor: import('xstate').AnyActorRef,
): Promise<void> {
  const { packsDir } = resolveAppContext();
  const packDir = path.join(packsDir, packId);

  if (!fs.existsSync(packDir)) {
    throw new Error(`Pack directory not found: ${packDir}`);
  }

  const manifestPath = path.join(packDir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No abuddy.json found in ${packDir}`);
  }

  await reloadPack(packId, backendActor, () => {
    const manifest: PackManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const pack = loadSingleExternalPack(manifest, packDir);
    if (!pack) throw new Error(`Failed to load pack ${packId} after rebuild`);

    return {
      register: () => {
        // registerExternalPacks logs why a registration was refused
        if (registerExternalPacks([pack]).length === 0) throw new Error(`Failed to register pack ${packId}`);
      },
      newSystemIds: Array.from(pack.systems.keys()).map(featureId => `${packId}.${featureId}`),
      onShutdown: pack.boot?.onShutdown,
      onInit: pack.boot?.onInit,
      afterRegister: () => {
        seedPackData(
          [pack],
          seedData,
          () => settingsRepository.settingsQueries.getInternalSettings().packSeedHashes ?? {},
          (hashes) => settingsRepository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], hashes),
        );
        updateLoadedPack(pack);
      },
    };
  }, packDir);
}

export async function reloadBuiltInPack(
  packId: string,
  backendActor: import('xstate').AnyActorRef,
): Promise<void> {
  const packInfo = getBuiltInPackInfos().find(p => p.id === packId);
  if (!packInfo) throw new Error(`Built-in pack not found: ${packId}`);

  const runtimeEntry = builtInRuntimeEntry(packInfo.dir);
  if (!fs.existsSync(runtimeEntry)) {
    throw new Error(`Built runtime not found: ${runtimeEntry}`);
  }

  await reloadPack(packId, backendActor, () => {
    const mod = withHostResolution(() => esmRequire(runtimeEntry));
    if (!mod.registration) throw new Error(`Built runtime for ${packId} has no registration export`);

    return {
      register: () => registerPack(mod.registration),
      newSystemIds: (mod.registration.systems as PackSystemDef[]).map(s => s.id),
      onShutdown: mod.registration.boot?.onShutdown,
      onInit: mod.registration.boot?.onInit,
    };
  }, path.join(packInfo.dir, 'dist'));
}
