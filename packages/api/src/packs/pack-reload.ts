import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/core/shared/debug/logger';
import {
  registerPack,
  unregisterPack,
  getPackRegistration,
  getPackBootHooks,
  publishHostPackArtifacts,
} from '@abuddy/host/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { PackSystemDef } from '@abuddy/sdk/framework';
import { registerShutdownHook, runShutdownHooksForKey } from '@abuddy/sdk/utils';
import { invalidateEventValidationMap } from '@/systems';
import { invalidatePartitionPolicy } from '@/core/ears/attribute-storage';
import {
  loadSingleExternalPack,
  clearPackRequireCache,
  registerExternalPacks,
  getBuiltInPackInfos,
  builtInRuntimeEntry,
  loadBuiltInRuntime,
  refreshBuiltInPackInfo,
} from './pack-loader';
import { orchestrateDeclarativeSeed, seedPackData } from './pack-seed';
import { updateLoadedPack } from './pack-api';
import { seedData } from '@abuddy/sdk/utils';
import { settingsRepository } from '@abuddy/host/settings';
import type { PackManifest } from '@abuddy/host/packs';

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
  // Side work once the swap is done (seeding, publishing artifacts, the loaded-pack list). By here the old
  // registration is gone and its shutdown hooks have run, so the systems must be restarted whatever this
  // does: a throw that escaped would leave the fresh registration live, the old actors running but already
  // torn down, and nothing ever stopped or respawned.
  try {
    fresh.afterRegister?.();
  } catch (err) {
    logger.error(`Pack ${packId} reloaded, but the work after registering it failed:`, err as Error);
  }

  // The bus stops each of these and starts those still registered: a feature the pack dropped only stops
  const systemIds = [...new Set([...oldSystemIds, ...fresh.newSystemIds])];

  backendActor.send({ type: 'RELOAD_PACK', packId, systemIds });
  // Other packs' systems read what this one registers and seeds (the chat's slash commands, say). Sent once the
  // fresh registration is live, never between unregistering the old one and registering it
  backendActor.send({ type: 'PACK_CHANGED', packId });

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
    const registration = loadBuiltInRuntime(packInfo.dir);
    if (!registration) throw new Error(`Built runtime for ${packId} has no registration export`);

    return {
      register: () => registerPack(registration),
      newSystemIds: (registration.systems as PackSystemDef[]).map(s => s.id),
      onShutdown: registration.boot?.onShutdown,
      onInit: registration.boot?.onInit,
      afterRegister: () => {
        refreshBuiltInPackInfo(packId);
        // A rebuild can carry new compiled seeds; the boot seed is hash-checked, so unchanged data isn't re-imported.
        // A rebuild running again mid-reload can take those files out from under it, so it doesn't stop the rest.
        const seedManifest = getPackBootHooks(packId)?.seedManifest;
        try {
          if (seedManifest) orchestrateDeclarativeSeed(seedManifest, packId);
        } catch (err) {
          logger.error(`Could not seed ${packId}'s compiled data on reload:`, err as Error);
        }
        // Pack authors resolve this pack's types, build code and seeds from the app's copy
        const { hostPacksDir } = resolveAppContext();
        try {
          publishHostPackArtifacts(packInfo.dir, path.join(hostPacksDir, packId));
        } catch (err) {
          logger.warn(`Could not publish build artifacts for ${packId}:`, err as Error);
        }
      },
    };
  }, path.join(packInfo.dir, 'dist'));
}
