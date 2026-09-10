import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/core/shared/debug/logger';
import {
  registerPack,
  unregisterPack,
  getPackContributions,
  getPacksDir,
} from '@abuddy/sdk/packs';
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
  withHostResolution,
} from './pack-loader';
import { seedPackData } from './pack-seed';
import { updateLoadedPack } from './pack-api';
import { seedData } from '@abuddy/sdk/utils';
import { repository } from '@abuddy/sdk/ears';
import type { PackManifest } from '@abuddy/sdk/packs';

// @ts-ignore TS1343 — runtime is ESM despite CJS tsconfig
const _metaUrl: string = import.meta.url;
const esmRequire = Module.createRequire(_metaUrl);

const logger = createLogger('pack-reload');

interface ReloadResult {
  newSystemIds: string[];
  shutdown?: () => void;
  createDefaultSettings?: () => void;
  afterRegister?: () => void;
}

async function reloadPack(
  packId: string,
  backendActor: import('xstate').AnyActorRef,
  loadFresh: () => ReloadResult | null,
  cacheDir: string,
): Promise<void> {
  const contributions = getPackContributions(packId);
  const oldSystemIds = contributions?.systems ?? [];

  logger.info(`Reloading pack: ${packId}`);

  runShutdownHooksForKey(packId);

  try { unregisterPack(packId); } catch {
    logger.info(`Pack ${packId} was not previously registered`);
  }

  invalidateEventValidationMap();
  invalidatePartitionPolicy();
  clearPackRequireCache(cacheDir);

  const result = loadFresh();
  if (!result) return;

  if (result.shutdown) {
    registerShutdownHook(result.shutdown, packId);
  }
  result.createDefaultSettings?.();
  result.afterRegister?.();

  const systemIds = [...new Set([...oldSystemIds, ...result.newSystemIds])];

  // XState's unregisterRecursively misses grandchild actors spawned without
  // an explicit `id` (they collide under the "undefined" key in
  // snapshot.children). Temporarily patch system._set to force-unregister
  // any orphaned actor before the replacement registers the same systemId.
  const sys = (backendActor as any).system;
  const originalSet = sys._set;
  sys._set = (systemId: string, actorRef: unknown) => {
    const existing = sys.get(systemId);
    if (existing) {
      sys._unregister(existing);
    }
    originalSet(systemId, actorRef);
  };

  try {
    backendActor.send({ type: 'RELOAD_PACK', packId, systemIds });
    backendActor.send({ type: 'RELOAD_PACK_CONNECT', systemIds });
  } finally {
    sys._set = originalSet;
  }

  logger.info(`Pack reloaded: ${packId} (${result.newSystemIds.length} systems)`);
}

export async function reloadExternalPack(
  packId: string,
  backendActor: import('xstate').AnyActorRef,
): Promise<void> {
  const packsDir = getPacksDir();
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
    if (!pack) {
      logger.error(`Failed to load pack ${packId} after rebuild`);
      return null;
    }

    const registered = registerExternalPacks([pack]);
    if (registered.length === 0) {
      logger.error(`Failed to register pack ${packId}`);
      return null;
    }

    return {
      newSystemIds: Array.from(pack.systems.keys()).map(featureId => `${packId}.${featureId}`),
      shutdown: pack.boot?.shutdown,
      createDefaultSettings: pack.boot?.createDefaultSettings,
      afterRegister: () => {
        seedPackData(
          [pack],
          seedData,
          () => repository.settingsQueries.getInternalSettings().packSeedHashes ?? {},
          (hashes) => repository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], hashes),
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

  const devEntry = path.join(packInfo.dir, 'dist', 'dev-entry.cjs');
  if (!fs.existsSync(devEntry)) {
    throw new Error(`Dev entry not found: ${devEntry}`);
  }

  await reloadPack(packId, backendActor, () => {
    const mod = withHostResolution(() => esmRequire(devEntry));
    if (!mod.registration) {
      logger.error(`Dev entry for ${packId} has no registration export`);
      return null;
    }

    registerPack(mod.registration);

    return {
      newSystemIds: (mod.registration.systems as PackSystemDef[]).map(s => s.id),
      shutdown: mod.registration.boot?.shutdown,
      createDefaultSettings: mod.registration.boot?.createDefaultSettings,
    };
  }, path.join(packInfo.dir, 'dist'));
}
