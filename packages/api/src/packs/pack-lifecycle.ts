import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/core/shared/debug/logger';
import { unregisterPack, getPackContributions } from '@abuddy/host/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { PackManifest } from '@abuddy/host/packs';
import { registerShutdownHook, runShutdownHooksForKey, seedData } from '@abuddy/sdk/utils';
import { invalidateEventValidationMap } from '@/systems';
import { invalidatePartitionPolicy } from '@/core/ears/attribute-storage';
import { loadSingleExternalPack, clearPackRequireCache, registerExternalPacks } from './pack-loader';
import { seedPackData } from './pack-seed';
import { updateLoadedPack, removeLoadedPack } from './pack-api';
import { repository } from '@abuddy/sdk/ears';

const logger = createLogger('pack-lifecycle');

export function teardownPack(
  packId: string,
  busActor: import('xstate').AnyActorRef,
): void {
  const contributions = getPackContributions(packId);
  const systemIds = contributions?.systems ?? [];

  logger.info(`Tearing down pack: ${packId}`);

  runShutdownHooksForKey(packId);

  try {
    unregisterPack(packId);
  } catch {
    logger.info(`Pack ${packId} was not previously registered`);
  }

  invalidateEventValidationMap();
  invalidatePartitionPolicy();

  const packDir = path.join(resolveAppContext().packsDir, packId);
  if (fs.existsSync(packDir)) {
    clearPackRequireCache(packDir);
  }

  removeLoadedPack(packId);

  if (systemIds.length > 0) {
    busActor.send({ type: 'TEARDOWN_PACK', systemIds });
  }

  logger.info(`Pack torn down: ${packId} (${systemIds.length} systems stopped)`);
}

export function activatePack(
  packId: string,
  busActor: import('xstate').AnyActorRef,
  options?: { seed?: boolean },
): boolean {
  const { packsDir } = resolveAppContext();
  const packDir = path.join(packsDir, packId);

  if (!fs.existsSync(packDir)) {
    logger.error(`Pack directory not found: ${packDir}`);
    return false;
  }

  const manifestPath = path.join(packDir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) {
    logger.error(`No abuddy.json found in ${packDir}`);
    return false;
  }

  let manifest: PackManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    logger.error(`Failed to parse manifest for ${packId}:`, err as Error);
    return false;
  }

  const pack = loadSingleExternalPack(manifest, packDir);
  if (!pack) {
    logger.error(`Failed to load pack ${packId}`);
    return false;
  }

  const registered = registerExternalPacks([pack]);
  if (registered.length === 0) {
    logger.error(`Failed to register pack ${packId}`);
    return false;
  }

  if (pack.boot?.onShutdown) {
    registerShutdownHook(pack.boot.onShutdown, packId);
  }
  pack.boot?.onInit?.();

  if (options?.seed) {
    seedPackData(
      [pack],
      seedData,
      () => repository.settingsQueries.getInternalSettings().packSeedHashes ?? {},
      (hashes) => repository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], hashes),
    );
  }

  updateLoadedPack(pack);

  const systemIds = Array.from(pack.systems.keys()).map(featureId => `${packId}.${featureId}`);
  if (systemIds.length > 0) {
    busActor.send({ type: 'ACTIVATE_PACK', systemIds });
  }

  logger.info(`Pack activated: ${packId} (${systemIds.length} systems started)`);
  return true;
}
