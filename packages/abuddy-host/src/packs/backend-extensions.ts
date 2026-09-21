// The lookups only the backend's registry (createPackRegistry) keeps of what registered packs contributed
import type { SeedHooks } from '@abuddy/sdk/seed';
import type { Seeder } from '@abuddy/sdk/utils';
import { checkFeatureSettings, type FeatureSettings, type PackCommand, type PackSettingsDefaults } from '@abuddy/sdk/framework';
import { qualifiedId } from '@abuddy/sdk/ids';

/** Seed hooks per entity type, each type's owned by the pack that registered it */
export function createSeedHookStore() {
  const byEntity = new Map<string, { hooks: SeedHooks; packId: string }>();
  return {
    register(entity: string, hooks: SeedHooks, packId: string): void {
      const existing = byEntity.get(entity);
      if (existing && existing.packId !== packId) {
        throw new Error(`Seed hooks for "${entity}" are already registered by pack "${existing.packId}"`);
      }
      byEntity.set(entity, { hooks, packId });
    },
    unregisterAll(packId: string): void {
      for (const [entity, entry] of byEntity) {
        if (entry.packId === packId) byEntity.delete(entity);
      }
    },
    get: (entity: string): SeedHooks | undefined => byEntity.get(entity)?.hooks,
  };
}

/** Each pack's seeders: two packs may declare the same seed key with different seeders */
export function createSeederStore() {
  const byPack = new Map<string, readonly Seeder[]>();
  return {
    register(packId: string, seeders: readonly Seeder[]): void {
      const keys = new Set<string>();
      for (const { key } of seeders) {
        if (keys.has(key)) throw new Error(`Pack "${packId}" registers two seeders for seed key "${key}"`);
        keys.add(key);
      }
      if (seeders.length > 0) byPack.set(packId, seeders);
    },
    unregister(packId: string): void {
      byPack.delete(packId);
    },
    get: (packId: string): readonly Seeder[] => byPack.get(packId) ?? [],
  };
}

/**
 * Registered packs' feature settings, merged into the defaults: each feature's own plugin slice and visibility
 * (`checkFeatureSettings`). `revision` changes, and listeners hear, whenever a pack's settings come or go.
 *
 * A manifest names the feature, and the settings land under the id its plugin runs under
 * (`<packId>.<featureId>`) — the key the renderer reads a plugin's settings and visibility by. Keyed by the
 * bare feature id, two packs with a `notes` feature each wrote the same slice and the second won.
 */
export function createSettingsDefaultsStore() {
  const byPack = new Map<string, Array<{ id: string; settings: FeatureSettings }>>();
  const listeners = new Set<() => void>();
  let current: PackSettingsDefaults = { revision: 0, settings: { plugins: {} } };

  function rebuild(): void {
    const plugins: Record<string, unknown> = {};
    const visibility: Record<string, boolean> = {};
    for (const [packId, features] of byPack) {
      for (const { id, settings } of features) {
        const own = settings.plugins ?? {};
        const pluginId = qualifiedId(packId, id);
        if (id in own) plugins[pluginId] = own[id];
        const visible = (own._meta as { visibility?: Record<string, boolean> } | undefined)?.visibility?.[id];
        if (visible !== undefined) visibility[pluginId] = visible;
      }
    }
    current = { revision: current.revision + 1, settings: { plugins: { ...plugins, ...(Object.keys(visibility).length > 0 && { _meta: { visibility } }) } } };
    for (const listener of listeners) listener();
  }

  return {
    /** Throws when a feature sets anything but its own plugin's settings, registering none of the pack's */
    register(packId: string, features: ReadonlyArray<{ id: string; settings?: FeatureSettings }>): void {
      const withSettings = features.filter((feature): feature is { id: string; settings: FeatureSettings } => feature.settings !== undefined);
      const problems = withSettings.flatMap(({ id, settings }) => checkFeatureSettings(id, settings));
      if (problems.length > 0) throw new Error(`Pack "${packId}" has invalid feature settings:\n  ${problems.join('\n  ')}`);
      if (withSettings.length === 0 && !byPack.has(packId)) return;
      byPack.set(packId, withSettings);
      rebuild();
    },
    unregister(packId: string): void {
      if (byPack.delete(packId)) rebuild();
    },
    get: (): PackSettingsDefaults => current,
    onChanged(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Each pack's declared slash commands, listed in the order the packs first registered */
export function createCommandStore() {
  const byPack = new Map<string, PackCommand[]>();
  // Kept when a pack unregisters, so a reload or update registers it again where it was
  const rank = new Map<string, number>();
  return {
    /** Throws when another pack already declares one of the commands, so nothing of this pack is registered */
    register(packId: string, commands: readonly PackCommand[]): void {
      for (const [otherId, theirs] of byPack) {
        if (otherId === packId) continue;
        for (const { name } of commands) {
          if (theirs.some((command) => command.name === name)) {
            throw new Error(`Command collision: "${name}" — pack "${packId}" vs "${otherId}"`);
          }
        }
      }
      if (commands.length === 0) {
        byPack.delete(packId);
        return;
      }
      if (!rank.has(packId)) rank.set(packId, rank.size);
      byPack.set(packId, commands.map((command) => ({ ...command })));
    },
    unregister(packId: string): void {
      byPack.delete(packId);
    },
    all: (): PackCommand[] => [...byPack]
      .sort(([a], [b]) => rank.get(a)! - rank.get(b)!)
      .flatMap(([, commands]) => commands.map((command) => ({ ...command }))),
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
