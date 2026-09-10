import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/core/shared/debug/logger';
import {
  registerPack,
  unregisterPack,
  getPackContributions,
  getPacksDir,
} from '@abuddy/sdk/packs';
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
const esmRequire = typeof require === 'function' ? require : Module.createRequire(_metaUrl);

const logger = createLogger('pack-reload');

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

  const contributions = getPackContributions(packId);
  const oldSystemIds = contributions?.systems ?? [];

  logger.info(`Reloading pack: ${packId}`);

  // 1. Run pack's shutdown hooks
  runShutdownHooksForKey(packId);

  // 2. Tear down old registration
  try {
    unregisterPack(packId);
  } catch {
    logger.info(`Pack ${packId} was not previously registered`);
  }

  // 3. Invalidate caches
  invalidateEventValidationMap();
  invalidatePartitionPolicy();

  // 4. Clear Node require cache for the pack's files
  clearPackRequireCache(packDir);

  // 5. Re-load the pack from disk
  const manifest: PackManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const pack = loadSingleExternalPack(manifest, packDir);
  if (!pack) {
    logger.error(`Failed to load pack ${packId} after rebuild`);
    return;
  }

  // 6. Re-register
  const registered = registerExternalPacks([pack]);
  if (registered.length === 0) {
    logger.error(`Failed to register pack ${packId}`);
    return;
  }

  // 7. Re-register shutdown hooks + run boot hooks
  if (pack.boot?.shutdown) {
    registerShutdownHook(pack.boot.shutdown, packId);
  }
  if (pack.boot?.createDefaultSettings) {
    pack.boot.createDefaultSettings();
  }

  // 8. Re-seed pack data (hash-checked)
  seedPackData(
    [pack],
    seedData,
    () => repository.settingsQueries.getInternalSettings().packSeedHashes ?? {},
    (hashes) => repository.settingsCommands.updateSettings('internal', null, ['packSeedHashes'], hashes),
  );

  // 9. Update the loaded packs registry for tRPC
  updateLoadedPack(pack);

  // 10. Send RELOAD_PACK to the backend actor
  const newSystemIds = Array.from(pack.systems.keys()).map(
    featureId => `${packId}.${featureId}`,
  );

  backendActor.send({
    type: 'RELOAD_PACK',
    packId,
    systemIds: [...new Set([...oldSystemIds, ...newSystemIds])],
  });

  logger.info(`Pack reloaded: ${packId} (${newSystemIds.length} systems)`);
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

  const contributions = getPackContributions(packId);
  const oldSystemIds = contributions?.systems ?? [];

  logger.info(`Reloading built-in pack: ${packId}`);

  runShutdownHooksForKey(packId);

  try { unregisterPack(packId); } catch {
    logger.info(`Pack ${packId} was not previously registered`);
  }

  invalidateEventValidationMap();
  invalidatePartitionPolicy();
  clearPackRequireCache(path.join(packInfo.dir, 'dist'));

  const mod = withHostResolution(() => esmRequire(devEntry));
  if (!mod.registration) {
    logger.error(`Dev entry for ${packId} has no registration export`);
    return;
  }

  registerPack(mod.registration);
  if (mod.registration.boot?.shutdown) {
    registerShutdownHook(mod.registration.boot.shutdown, packId);
  }
  mod.registration.boot?.createDefaultSettings?.();

  const newSystemIds = (mod.registration.systems as import('@abuddy/sdk/framework').PackSystemDef[]).map(s => s.id);

  backendActor.send({
    type: 'RELOAD_PACK',
    packId,
    systemIds: [...new Set([...oldSystemIds, ...newSystemIds])],
  });

  logger.info(`Built-in pack reloaded: ${packId} (${newSystemIds.length} systems)`);
}
