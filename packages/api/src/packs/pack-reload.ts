import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/core/shared/debug/logger';
import {
  registerPack,
  unregisterPack,
  getPackContributions,
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
  withHostResolution,
} from './pack-loader';
import { seedPackData } from './pack-seed';
import { updateLoadedPack } from './pack-api';
import { seedData } from '@abuddy/sdk/utils';
import { repository } from '@abuddy/sdk/ears';
import type { PackManifest } from '@abuddy/host/packs';

// @ts-ignore TS1343 — runtime is ESM despite CJS tsconfig
const _metaUrl: string = import.meta.url;
const esmRequire = Module.createRequire(_metaUrl);

const logger = createLogger('pack-reload');

interface ReloadResult {
  newSystemIds: string[];
  onShutdown?: () => void;
  onInit?: () => void;
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

  if (result.onShutdown) {
    registerShutdownHook(result.onShutdown, packId);
  }
  result.onInit?.();
  result.afterRegister?.();

  const systemIds = [...new Set([...oldSystemIds, ...result.newSystemIds])];

  backendActor.send({ type: 'RELOAD_PACK', packId, systemIds });

  logger.info(`Pack reloaded: ${packId} (${result.newSystemIds.length} systems)`);
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
      onShutdown: pack.boot?.onShutdown,
      onInit: pack.boot?.onInit,
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
      onShutdown: mod.registration.boot?.onShutdown,
      onInit: mod.registration.boot?.onInit,
    };
  }, path.join(packInfo.dir, 'dist'));
}
