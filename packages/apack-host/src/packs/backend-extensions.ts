// The lookups only the backend's registry (createPackRegistry) keeps of what registered packs contributed
import type { ContentWriter } from '@apackdev/sdk/content';
import type { ContentApplier } from '@apackdev/sdk/utils';

/** Content writers per entity type, each type's owned by the pack that registered it */
export function createContentWriterStore() {
  const byEntity = new Map<string, { hooks: ContentWriter; packId: string }>();
  return {
    register(entity: string, hooks: ContentWriter, packId: string): void {
      const existing = byEntity.get(entity);
      if (existing && existing.packId !== packId) {
        throw new Error(`Content writers for "${entity}" are already registered by pack "${existing.packId}"`);
      }
      byEntity.set(entity, { hooks, packId });
    },
    get: (entity: string): ContentWriter | undefined => byEntity.get(entity)?.hooks,
  };
}

/** Each pack's appliers: two packs may declare the same content key with different appliers */
export function createApplierStore() {
  const byPack = new Map<string, readonly ContentApplier[]>();
  return {
    register(packId: string, appliers: readonly ContentApplier[]): void {
      const keys = new Set<string>();
      for (const { key } of appliers) {
        if (keys.has(key)) throw new Error(`Pack "${packId}" registers two appliers for content key "${key}"`);
        keys.add(key);
      }
      if (appliers.length > 0) byPack.set(packId, appliers);
    },
    get: (packId: string): readonly ContentApplier[] => byPack.get(packId) ?? [],
  };
}

/** Hooks run when a pack stops (keyed by pack id) or the app exits */
export function createShutdownHooks() {
  const byKey = new Map<string, Array<() => void>>();
  const run = (hooks: ReadonlyArray<() => void>) => {
    for (const hook of hooks) {
      try { hook(); } catch (err) { console.error('[shutdown]', err); }
    }
  };
  return {
    registerShutdownHook(hook: () => void, key = '_global'): void {
      const hooks = byKey.get(key) ?? [];
      hooks.push(hook);
      byKey.set(key, hooks);
    },
    /** Runs every registered hook (the app exiting) */
    runShutdownHooks(): void {
      for (const hooks of byKey.values()) run(hooks);
    },
    /** Runs and removes a pack's hooks (the pack stopping) */
    runShutdownHooksForKey(key: string): void {
      const hooks = byKey.get(key);
      if (!hooks) return;
      run(hooks);
      byKey.delete(key);
    },
    /** Removes a pack's hooks without running them */
    removeShutdownHooksForKey(key: string): void {
      byKey.delete(key);
    },
  };
}
