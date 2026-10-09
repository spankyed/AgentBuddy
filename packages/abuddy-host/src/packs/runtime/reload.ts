import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@abuddy/sdk/logger';
import { resolveAppContext, getAppVersion } from '@abuddy/sdk/env';
import { packSystemIds, type PackRegistry } from '../registry.ts';
import { installShippedPacks } from '../installer.ts';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';
import type { PackManifest } from '../discovery.ts';
import { loadSingleExternalPack, clearPackRequireCache, registerExternalPacks } from './loader.ts';
import { runPackMigrations } from '../../migrations/index.ts';
import { applyPacks } from './apply.ts';

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
  registry: PackRegistry,
  packId: string,
  backendActor: import('xstate').AnyActorRef,
  loadFresh: () => FreshPack,
  cacheDir: string,
): Promise<void> {
  const previous = registry.getPackRegistration(packId);
  // Restored with the registration if the fresh one is refused: without it the registry forgets where the pack came
  // from, and a built-in pack's next reload can't find it
  const previousOrigin = registry.packOrigin(packId) ?? undefined;
  const oldSystemIds = previous ? packSystemIds(previous) : [];

  logger.info(`Reloading pack: ${packId}`);

  // The running pack's modules stay live; only a fresh require loads the rebuilt ones
  clearPackRequireCache(cacheDir);
  const fresh = loadFresh();

  if (previous) registry.unregisterPack(packId);
  else logger.info(`Pack ${packId} was not previously registered`);
  try {
    fresh.register();
  } catch (err) {
    if (previous) registry.registerPack(previous, previousOrigin);
    throw err;
  }

  registry.runShutdownHooksForKey(packId);
  if (fresh.onShutdown) {
    registry.registerShutdownHook(fresh.onShutdown, packId);
  }
  fresh.onInit?.();
  // Side work once the swap is done (applying content, publishing build output, the loaded-pack list). By here the old
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

/**
 * Reloads a pack after a rebuild: its built runtime is re-required from its own directory, its systems are
 * stopped and respawned, and its data is brought up to date.
 *
 * **The caller says which pack, never what kind of pack it is.** The registry already knows which directory
 * the pack was loaded from, and a caller that could claim otherwise could ask for a reload of a pack the app
 * does not have in the place it says.
 */
export async function reloadPackById(
  registry: PackRegistry,
  packId: string,
  backendActor: import('xstate').AnyActorRef,
): Promise<void> {
  const { packsDir } = resolveAppContext();
  const packDir = path.join(packsDir, packId);

  // A pack the app ships is rebuilt in the checkout and loaded from `packsDir`, so the rebuild reaches the
  // app only once the installed copy carries it. `installShippedPacks` is the same comparison the boot
  // makes and writes nothing when the two agree, so asking here costs a pack's worth of hashing on a
  // reload that changed nothing — and a reload of any other pack matches no shipped id and does nothing.
  // Without it `abuddy build --watch` rebuilds and the app re-requires the copy from before the edit.
  const shippedDir = process.env.SHIPPED_PACKS_DIR;
  if (shippedDir) {
    for (const result of await installShippedPacks(shippedDir, packsDir, {
      only: packId,
      hostVersion: getAppVersion(),
      packFormat: PACK_SNAPSHOT_FORMAT,
    })) {
      // The author's edit is the point of the reload, so a refresh that failed is the answer rather than a
      // note beside a reload of the previous build
      if (result.outcome === 'failed') throw new Error(`Could not refresh the installed copy of ${packId}, which this app ships: ${result.error}`);
      if (result.outcome !== 'current') logger.info(`Refreshed the installed copy of ${packId} from ${shippedDir}`);
    }
  }

  if (!fs.existsSync(packDir)) {
    throw new Error(`Pack directory not found: ${packDir}`);
  }

  const manifestPath = path.join(packDir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No abuddy.json found in ${packDir}`);
  }

  await reloadPack(registry, packId, backendActor, () => {
    const manifest: PackManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const pack = loadSingleExternalPack(manifest, packDir);
    if ('problem' in pack) {
      // A pack still running keeps its previous runtime, so only one that isn't has a load problem to show
      if (!registry.getPackRegistration(packId)) registry.recordLoadProblem(packId, pack.problem);
      throw new Error(`Failed to load pack ${packId} after rebuild: ${pack.problem}`);
    }

    return {
      register: () => {
        // registerExternalPacks logs why a registration was refused
        if (registerExternalPacks(registry, [pack]).length === 0) throw new Error(`Failed to register pack ${packId}`);
      },
      newSystemIds: packSystemIds(pack.registration),
      onShutdown: pack.registration.boot?.onShutdown,
      onInit: pack.registration.boot?.onInit,
      afterRegister: () => {
        runPackMigrations(registry.packMigrationTargets([packId]));
        applyPacks(registry.packContentTargets([packId]));
      },
    };
  }, packDir);
}
