import type { PersistenceSink } from '../runtime.ts';
import { EARS } from '../entities.ts';
import type { EarsAdmin } from '../engine.ts';
import type { Partition, PartitionPolicy } from '../persistence/policy.ts';
import { makeShardedPersistence, type ShardedPersistence } from '../persistence/sharded-router.ts';
import { openShardedEnvs, closeShardedEnvs, deleteLmdbDirectories, type LmdbDbs, type LmdbPaths } from './envs.ts';
import { makeLmdbAdapter } from './adapter.ts';
import { hydrateSharded } from './hydrate.ts';
import { LmdbQuery } from './query.ts';

/** An app's LMDB store: one environment per partition, and the sink that writes the engine's changes to them */
export interface LmdbStore {
  /**
   * The engine's persistence: create the engine with it (`createEarsEngine({ persistence: store.sink })`).
   * It stays the same object when the store reopens, and drops writes while the store is closed.
   */
  readonly sink: ShardedPersistence;
  /** The partition policy the store was opened with */
  readonly policy: PartitionPolicy;
  /** Each partition's open environment. Throws while the store is closed */
  readonly envs: Readonly<Record<Partition, LmdbDbs>>;
  /** Whether the environments are open */
  isOpen(): boolean;
  /**
   * Loads the partitions the policy hydrates (and the volatile one with `includeVolatile`) into the
   * store's engine. `skipTombstoneScan` loads tombstoned entities' rows too.
   */
  hydrate(options?: { includeVolatile?: boolean; skipTombstoneScan?: boolean }): Promise<void>;
  /** Direct reads of a partition's environment, without hydrating it */
  query(partition: Partition): LmdbQuery;
  /** Flushes pending writes and closes the environments. Closing a closed store does nothing */
  close(): void;
  /** Opens the environments again (after their files were replaced, say), closing them first if open */
  reopen(): void;
  /** Closes the store, deletes its files and opens it empty. Doesn't touch the engine's memory */
  reset(): Promise<void>;
}

const HARD_DELETE_MODE = true;

const ignoresClosed = (error: unknown) =>
  error instanceof Error && (error.message.includes('Dbi is not open') || error.message.includes('already been closed'));

/** What an LMDB store is opened with */
export interface LmdbStoreOptions {
  /** Each partition's database directory */
  paths: LmdbPaths;
  /** Which partition each entity and relation lives in */
  policy: PartitionPolicy;
  /**
   * The engine the store persists: hydration loads into it, and the sink reads a relation's details from it.
   * A function, because the engine is created with the store's sink.
   */
  engine: () => EarsAdmin;
}

/**
 * Opens the LMDB environments at `paths` and returns the store. Nothing reaches the engine until the
 * caller creates it with `store.sink` and hydrates.
 */
export function openLmdbStore({ paths, policy, engine }: LmdbStoreOptions): LmdbStore {
  const relationDetails = (relId: EARS.EntityId) =>
    engine().getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | null;
  let envs: Record<Partition, LmdbDbs> | null = null;
  let current: ShardedPersistence | null = null;

  function open() {
    envs = openShardedEnvs(paths);
    current = makeShardedPersistence(policy, {
      primary: makeLmdbAdapter(envs.primary, { hardDelete: HARD_DELETE_MODE }),
      volatileBackup: makeLmdbAdapter(envs.volatileBackup, { hardDelete: HARD_DELETE_MODE }),
    }, relationDetails);
  }

  function close() {
    const [closingEnvs, closingSink] = [envs, current];
    envs = null;
    current = null;
    if (!closingEnvs) return;
    const warn = (error: unknown) => {
      if (!ignoresClosed(error)) console.warn('[Persistence] Non-critical close error:', (error as Error).message);
    };
    // The environments close even if the final flush throws
    try {
      closingSink?.close?.();
    } catch (error) {
      warn(error);
    } finally {
      try {
        closeShardedEnvs(closingEnvs);
      } catch (error) {
        warn(error);
      }
    }
  }

  function openEnvs(): Record<Partition, LmdbDbs> {
    if (!envs) throw new Error('The LMDB store is closed');
    return envs;
  }

  // Forwards to the current environments' sinks, so the engine keeps one sink across reopens
  const write = (fn: (sink: ShardedPersistence) => void) => { if (current) fn(current); };
  const sink: ShardedPersistence = {
    onCreateEntity: (...args) => write((s) => s.onCreateEntity(...args)),
    onDestroyEntity: (...args) => write((s) => s.onDestroyEntity(...args)),
    onDropAttr: (...args) => write((s) => s.onDropAttr(...args)),
    onPutAttrArray: (...args) => write((s) => s.onPutAttrArray(...args)),
    onAddRelation: (...args) => write((s) => s.onAddRelation(...args)),
    onUpdateRelation: (...args) => write((s) => s.onUpdateRelation(...args)),
    onRemoveRelation: (...args) => write((s) => s.onRemoveRelation(...args)),
    seedRelationMetadata: (...args) => write((s) => s.seedRelationMetadata(...args)),
    getRelMeta: () => current?.getRelMeta() ?? new Map(),
    getErrorStats: () => current?.getErrorStats?.() ?? { errorCount: 0, lastError: null },
    close,
  } satisfies Required<PersistenceSink> & ShardedPersistence;

  open();

  return {
    sink,
    policy,
    get envs() { return openEnvs(); },
    isOpen: () => envs !== null,
    hydrate: ({ includeVolatile = false, skipTombstoneScan = false } = {}) =>
      hydrateSharded({ engine: engine(), envs: openEnvs(), policy, includeVolatile, skipTombstoneScan, shardedPersistence: sink }),
    query: (partition) => new LmdbQuery(openEnvs()[partition]),
    close,
    reopen() {
      close();
      open();
    },
    async reset() {
      close();
      // Let LMDB release the files before deleting them
      await new Promise((resolve) => setTimeout(resolve, 100));
      deleteLmdbDirectories(paths);
      open();
    },
  };
}
