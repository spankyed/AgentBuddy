import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext } from '@abuddy/sdk/env';
import { seedData } from '@abuddy/sdk/utils';
import type { PackRegistry } from '../pack-registration.ts';
import type { PackManifest } from '../pack-discovery.ts';
import { appState } from '../../app-state/index.ts';
import { loadSingleExternalPack, clearPackRequireCache, registerExternalPacks } from './loader.ts';
import { seedPackData } from './seed.ts';
import { updateLoadedPack, removeLoadedPack } from './loaded-packs.ts';

const logger = createLogger('pack-lifecycle');

/**
 * Stops and unregisters a pack. `replacing` means an activation of the same pack follows (an update):
 * the caller sends PACK_CHANGED once that completes, so running systems never see the pack missing.
 */
export function teardownPack(
  registry: PackRegistry,
  packId: string,
  busActor: import('xstate').AnyActorRef,
  { replacing = false }: { replacing?: boolean } = {},
): void {
  const contributions = registry.getPackContributions(packId);
  const systemIds = contributions?.systems ?? [];

  logger.info(`Tearing down pack: ${packId}`);

  registry.runShutdownHooksForKey(packId);

  try {
    registry.unregisterPack(packId);
  } catch {
    logger.info(`Pack ${packId} was not previously registered`);
  }

  const packDir = path.join(resolveAppContext().packsDir, packId);
  if (fs.existsSync(packDir)) {
    clearPackRequireCache(packDir);
  }

  removeLoadedPack(packId);

  if (systemIds.length > 0) {
    busActor.send({ type: 'TEARDOWN_PACK', systemIds });
  }
  // The systems still running read what the pack registered (its slash commands, say)
  if (!replacing) busActor.send({ type: 'PACK_CHANGED', packId });

  logger.info(`Pack torn down: ${packId} (${systemIds.length} systems stopped)`);
}

export function activatePack(
  registry: PackRegistry,
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

  const registered = registerExternalPacks(registry, [pack]);
  if (registered.length === 0) {
    logger.error(`Failed to register pack ${packId}`);
    return false;
  }

  if (pack.boot?.onShutdown) {
    registry.registerShutdownHook(pack.boot.onShutdown, packId);
  }
  pack.boot?.onInit?.();

  if (options?.seed) {
    seedPackData(
      [pack],
      seedData,
      appState.getPackSeedHashes,
      appState.setPackSeedHashes,
    );
  }

  updateLoadedPack(pack);
  // The running systems read what the pack registered and seeded (the chat's slash commands, say). Sent
  // before its own systems start: they send their startup data when they do
  busActor.send({ type: 'PACK_CHANGED', packId });

  const systemIds = Array.from(pack.systems.keys()).map(featureId => `${packId}.${featureId}`);
  if (systemIds.length > 0) {
    busActor.send({ type: 'ACTIVATE_PACK', packId, systemIds });
  }

  logger.info(`Pack activated: ${packId} (${systemIds.length} systems started)`);
  return true;
}
