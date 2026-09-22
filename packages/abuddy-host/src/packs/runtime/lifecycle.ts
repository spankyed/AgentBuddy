import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { PackRegistry } from '../pack-registration.ts';
import type { PackManifest } from '../pack-discovery.ts';
import { loadSingleExternalPack, clearPackRequireCache, registerExternalPacks } from './loader.ts';
import { runPackMigrations } from '../../migrations/index.ts';
import { seedPackData } from './seed.ts';

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
  const extensions = registry.getPackExtensions(packId);
  const systemIds = extensions?.systems ?? [];

  logger.info(`Tearing down pack: ${packId}`);

  registry.runShutdownHooksForKey(packId);
  // Whatever stopped it loading is no longer the pack's state: it is disabled, gone, or about to be activated again
  registry.clearLoadProblem(packId);

  // An update tears the pack down, downloads the new release, then activates it — so its plugins are
  // missing for as long as the download takes, and a send to one of them in that window is expected
  // rather than a mistake. Marked before unregistering, while the registration still says which
  // plugins are the pack's; registering the replacement clears it.
  if (replacing) registry.markPackReplacing(packId);

  // Asked, not caught: unregisterPack also throws when a contribution couldn't be taken back out, and
  // reporting that as a pack nobody had registered is the wrong story. The pack is unregistered either
  // way, so the rest of the teardown — the require cache, stopping its systems — still has to happen.
  if (!registry.getPackRegistration(packId)) {
    logger.info(`Pack ${packId} was not previously registered`);
  } else {
    try {
      registry.unregisterPack(packId);
    } catch (err) {
      logger.error(`Tearing down pack ${packId}:`, err as Error);
    }
  }

  const packDir = path.join(resolveAppContext().packsDir, packId);
  if (fs.existsSync(packDir)) {
    clearPackRequireCache(packDir);
  }

  if (systemIds.length > 0) {
    busActor.send({ type: 'TEARDOWN_PACK', systemIds });
  }
  // The systems still running read what the pack registered (its slash commands, say)
  if (!replacing) busActor.send({ type: 'PACK_CHANGED', packId });

  logger.info(`Pack torn down: ${packId} (${systemIds.length} systems stopped)`);
}

/**
 * Loads, registers and starts an installed pack as a boot starts it: its onInit, its migrations, then its seeds
 * (hash-checked, so unchanged data isn't imported again). Returns false when it can't be read, loaded or registered,
 * with why recorded as the pack's load problem in `registry`.
 */
export function activatePack(
  registry: PackRegistry,
  packId: string,
  busActor: import('xstate').AnyActorRef,
): boolean {
  const { packsDir } = resolveAppContext();
  const packDir = path.join(packsDir, packId);

  const failed = (problem: string, err?: Error): false => {
    logger.error(`Failed to load pack ${packId}: ${problem}`, err);
    registry.recordLoadProblem(packId, problem);
    return false;
  };

  if (!fs.existsSync(packDir)) return failed(`pack directory not found: ${packDir}`);

  const manifestPath = path.join(packDir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) return failed(`no abuddy.json found in ${packDir}`);

  let manifest: PackManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return failed(`its abuddy.json could not be read: ${(err as Error).message}`, err as Error);
  }

  const pack = loadSingleExternalPack(manifest, packDir);
  if ('problem' in pack) return failed(pack.problem);

  // A refused registration is recorded as the load problem by registerExternalPacks
  const registered = registerExternalPacks(registry, [pack]);
  if (registered.length === 0) {
    logger.error(`Failed to register pack ${packId}`);
    return false;
  }

  const { boot } = pack.registration;
  if (boot?.onShutdown) {
    registry.registerShutdownHook(boot.onShutdown, packId);
  }
  boot?.onInit?.();
  // The pack is registered by now, so its migrations and seeds are read from the registry like a boot's
  const targets = registry.externalPackTargets([packId]);
  runPackMigrations(targets);
  seedPackData(targets);

  // The running systems read what the pack registered and seeded (the chat's slash commands, say). Sent
  // before its own systems start: they send their startup data when they do
  busActor.send({ type: 'PACK_CHANGED', packId });

  const systemIds = registry.getRegisteredPackSystemIds(packId);
  if (systemIds.length > 0) {
    busActor.send({ type: 'ACTIVATE_PACK', packId, systemIds });
  }

  logger.info(`Pack activated: ${packId} (${systemIds.length} systems started)`);
  return true;
}
