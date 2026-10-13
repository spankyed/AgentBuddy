import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@apackdev/sdk/logger';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { packSystemIds, type PackRegistry } from '../registry.ts';
import { loadSingleExternalPack, clearPackRequireCache, registerExternalPacks, type LoadedPack } from './loader.ts';
import { runPackMigrations } from '../../migrations/index.ts';
import { applyPacks } from './apply.ts';
import { errorMessage } from '@apackdev/sdk/utils/pure';

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

  const packDir = path.join(resolveAppEnvironment().packsDir, packId);
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
 * Loads, registers and starts an installed pack as a boot starts it: its onInit, its migrations, then its content
 * (hash-checked, so unchanged data isn't imported again). Returns false when it can't be read, loaded or registered,
 * with why recorded as the pack's load problem in `registry`.
 */
export function activatePack(
  registry: PackRegistry,
  packId: string,
  busActor: import('xstate').AnyActorRef,
): boolean {
  const { packsDir } = resolveAppEnvironment();
  registry.refreshCatalog(packsDir);
  const packDir = path.join(packsDir, packId);

  const failed = (problem: string, err?: Error): false => {
    logger.error(`Failed to load pack ${packId}: ${problem}`, err);
    registry.recordLoadProblem(packId, problem);
    return false;
  };

  if (!fs.existsSync(packDir)) return failed(`pack directory not found: ${packDir}`);

  const pack = loadSingleExternalPack(packDir);
  if ('problem' in pack) return failed(pack.problem);

  // A refused registration is recorded as the load problem by registerExternalPacks
  const registered = registerExternalPacks(registry, [pack]);
  if (registered.length === 0) {
    logger.error(`Failed to register pack ${packId}`);
    return false;
  }

  return startAcceptedPack(registry, pack, busActor);
}

/**
 * Accept the candidate currently at its final install path, preserving the incumbent on refusal.
 * Call the returned starter only after filesystem publication succeeds: initialization can write data.
 */
export function acceptInstalledPack(
  registry: PackRegistry,
  packId: string,
  busActor: import('xstate').AnyActorRef,
): () => boolean {
  const packDir = path.join(resolveAppEnvironment().packsDir, packId);
  const previous = registry.getPackRegistration(packId);
  const previousSystemIds = previous ? packSystemIds(previous) : undefined;
  const shippedIds = registry.packOrigin(packId)?.shipped ? new Set([packId]) : new Set<string>();
  clearPackRequireCache(packDir);
  let pack: LoadedPack;
  let cleanupProblems: string[] = [];
  try {
    const candidate = loadSingleExternalPack(packDir, shippedIds);
    if ('problem' in candidate) throw new Error(`Failed to load pack ${packId}: ${candidate.problem}`);
    pack = candidate;
    if (previous) {
      cleanupProblems = registry.replacePack(pack.registration, pack.origin);
    } else {
      registry.registerPack(pack.registration, pack.origin);
    }
  } catch (error) {
    clearPackRequireCache(packDir);
    throw error;
  }
  return () => {
    const started = startAcceptedPack(registry, pack, busActor, previousSystemIds);
    for (const problem of cleanupProblems) logger.error(`Pack ${packId} accepted, but old binding cleanup failed: ${problem}`);
    return started;
  };
}

function startAcceptedPack(
  registry: PackRegistry,
  pack: LoadedPack,
  busActor: import('xstate').AnyActorRef,
  previousSystemIds?: string[],
): boolean {
  const packId = pack.registration.id;
  const systemIds = packSystemIds(pack.registration);
  const affectedSystemIds = [...new Set([...(previousSystemIds ?? []), ...systemIds])];
  const { boot } = pack.registration;
  if (previousSystemIds) registry.runShutdownHooksForKey(packId);
  if (boot?.onShutdown) registry.registerShutdownHook(boot.onShutdown, packId);
  try {
    registry.refreshCatalog(resolveAppEnvironment().packsDir);
    boot?.onInit?.();
    runPackMigrations(registry.packMigrationTargets('pack', [packId]));
    applyPacks(registry.packContentTargets([packId]));
  } catch (error) {
    registry.runShutdownHooksForKey(packId);
    try { registry.unregisterPack(packId); }
    catch (cleanupError) { logger.error(`Cleaning up failed activation of ${packId}:`, cleanupError as Error); }
    if (affectedSystemIds.length) busActor.send({ type: 'TEARDOWN_PACK', systemIds: affectedSystemIds });
    busActor.send({ type: 'PACK_CHANGED', packId });
    const problem = `initialization failed: ${errorMessage(error)}`;
    logger.error(`Failed to start accepted pack ${packId}: ${problem}`);
    registry.recordLoadProblem(packId, problem);
    return false;
  }

  if (previousSystemIds) {
    busActor.send({ type: 'RELOAD_PACK', packId, systemIds: affectedSystemIds });
    busActor.send({ type: 'PACK_CHANGED', packId });
  } else {
    busActor.send({ type: 'PACK_CHANGED', packId });
    if (systemIds.length) busActor.send({ type: 'ACTIVATE_PACK', packId, systemIds });
  }
  logger.info(`Pack activated: ${packId} (${systemIds.length} systems started)`);
  return true;
}
