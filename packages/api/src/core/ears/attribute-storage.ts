import { setPersistence, clearMemory } from "@abuddy/sdk/ears/internals";
import { getLmdbPath, getVolatileLmdbPath, getSecretsLmdbPath } from "@abuddy/sdk/utils";
import { openShardedEnvs, closeShardedEnvs, deleteLmdbDirectories } from "@/core/persistence/lmdb/envs";
import { makeLmdbAdapter } from "@/core/persistence/lmdb/adapter";
import { makePolicy, makeShardedPersistence, type PartitionPolicy } from "@abuddy/sdk/persistence";
import { getRegisteredEARSPolicy } from "@abuddy/sdk/packs";

const HARD_DELETE_MODE = true;

let envs = openShardedEnvs({
  primary: getLmdbPath(),
  volatileBackup: getVolatileLmdbPath(),
  secrets: getSecretsLmdbPath(),
});

let sinks = {
  primary: makeLmdbAdapter(envs.primary, { hardDelete: HARD_DELETE_MODE }),
  volatileBackup: makeLmdbAdapter(envs.volatileBackup, { hardDelete: HARD_DELETE_MODE }),
  secrets: makeLmdbAdapter(envs.secrets, { hardDelete: HARD_DELETE_MODE }),
};

let _resolvedPolicy: PartitionPolicy | null = null;
function resolvePolicy(): PartitionPolicy {
  if (!_resolvedPolicy) {
    const earsPolicy = getRegisteredEARSPolicy();
    _resolvedPolicy = makePolicy({
      excludedEntityTypes: new Set(earsPolicy.excludedEntityTypes),
      secretEntityTypes: new Set(earsPolicy.secretEntityTypes),
      hydratePartitions: new Set(['primary', 'secrets']),
    });
  }
  return _resolvedPolicy;
}

const policy: PartitionPolicy = {
  routeEntity: (...args) => resolvePolicy().routeEntity(...args),
  routeRelation: (...args) => resolvePolicy().routeRelation(...args),
  get hydrate() { return resolvePolicy().hydrate; },
};

let persistence = makeShardedPersistence(policy, sinks);

// Inject LMDB persistence into the SDK engine
setPersistence(persistence);

export function invalidatePartitionPolicy(): void {
  _resolvedPolicy = null;
}

export { envs, policy, persistence };

export function closePersistence() {
  try {
    persistence.close?.();
    closeShardedEnvs(envs);
  } catch (error) {
    if (error instanceof Error &&
        !error.message?.includes('Dbi is not open') &&
        !error.message?.includes('already been closed')) {
      console.warn('[Persistence] Non-critical close error:', error.message);
    }
  }
}

export function reinitializeLmdb() {
  if (envs !== null) {
    closePersistence();
  }

  envs = openShardedEnvs({
    primary: getLmdbPath(),
    volatileBackup: getVolatileLmdbPath(),
    secrets: getSecretsLmdbPath(),
  });

  sinks = {
    primary: makeLmdbAdapter(envs.primary, { hardDelete: HARD_DELETE_MODE }),
    volatileBackup: makeLmdbAdapter(envs.volatileBackup, { hardDelete: HARD_DELETE_MODE }),
    secrets: makeLmdbAdapter(envs.secrets, { hardDelete: HARD_DELETE_MODE }),
  };

  persistence = makeShardedPersistence(policy, sinks);
  setPersistence(persistence);
}

export async function resetLmdbFiles() {
  clearMemory();
  const currentEnvs = envs;
  envs = null as any;

  try {
    persistence.close?.();
    closeShardedEnvs(currentEnvs);
  } catch (error) {
    // Expected if already closed
  }

  await new Promise(resolve => setTimeout(resolve, 100));

  deleteLmdbDirectories({
    primary: getLmdbPath(),
    volatileBackup: getVolatileLmdbPath(),
    secrets: getSecretsLmdbPath(),
  });

  reinitializeLmdb();
}

