// The lookups only the backend's registry (createPackRegistry) keeps of what registered packs contributed
import type { ContentWriter } from '@apackdev/sdk/content';
import type { ContentApplier } from '@apackdev/sdk/utils';
import { _compileSettingsDefinition, type PackFeature, type SettingsValidator, type PackCommand, type HelpDocument, type HelpCatalog, type HelpProblem, type PackSettingsDefaults } from '@apackdev/sdk/framework';
import { resolveName } from '@apackdev/sdk/ids';

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
    unregisterAll(packId: string): void {
      for (const [entity, entry] of byEntity) {
        if (entry.packId === packId) byEntity.delete(entity);
      }
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
    unregister(packId: string): void {
      byPack.delete(packId);
    },
    get: (packId: string): readonly ContentApplier[] => byPack.get(packId) ?? [],
  };
}

/**
 * Registered packs' feature settings, merged into the defaults: each feature's own slice and whether its
 * tab shows. `revision` changes, and listeners hear, whenever a pack's settings come or
 * go. A manifest names the feature; its settings land under the feature's ref, which the renderer reads by.
 */
export function createSettingsDefaultsStore() {
  const byPack = new Map<string, Array<{
    id: string; defaults?: Record<string, unknown>; validator?: SettingsValidator; defaultVisible?: boolean;
  }>>();
  /** App preference sections contributed by registered packs. */
  const sectionsByPack = new Map<string, () => Record<string, unknown>>();
  const listeners = new Set<() => void>();
  let current: PackSettingsDefaults = { revision: 0, settings: { features: {} }, validators: {}, visibility: {} };

  function rebuild(): void {
    const features: Record<string, unknown> = {};
    const validators: PackSettingsDefaults['validators'] = {};
    const visibility: Record<string, boolean> = {};
    for (const [packId, declarations] of byPack) {
      for (const { id, defaults, validator, defaultVisible } of declarations) {
        const ref = resolveName(id, packId);
        if (validator) {
          features[ref] = defaults;
          validators[ref] = validator;
        }
        if (defaultVisible !== undefined) visibility[ref] = defaultVisible;
      }
    }

    const sections: Record<string, unknown> = {};
    for (const [packId, read] of sectionsByPack) {
      try {
        for (const [name, value] of Object.entries(read())) sections[name] = value;
      } catch (error) {
        throw new Error(`Pack "${packId}" could not read its settings sections: ${(error as Error).message}`);
      }
    }
    current = { revision: current.revision + 1, settings: { ...sections, features }, validators, visibility };
    for (const listener of listeners) listener();
  }

  return {
    /** Validates each declaration before registering the pack's defaults and schemas */
    register(packId: string, features: ReadonlyArray<PackFeature & { id: string }>, sections?: () => Record<string, unknown>): void {
      const declarations = features.filter(f => f.settings !== undefined || f.plugin?.defaultVisible !== undefined).map(({ id, settings, plugin }) => {
        try {
          const validator = settings ? _compileSettingsDefinition(settings) : undefined;
          return { id, defaultVisible: plugin?.defaultVisible,
            ...(settings && { defaults: structuredClone(settings.defaults), validator }),
          };
        } catch (error) {
          throw new Error(`Pack "${packId}" has invalid feature settings for "${id}": ${error instanceof Error ? error.message : String(error)}`);
        }
      });
      if (sections) sectionsByPack.set(packId, sections);
      if (!declarations.some(d => d.validator || d.defaultVisible !== undefined) && !sections && !byPack.has(packId)) return;
      byPack.set(packId, declarations);
      rebuild();
    },
    unregister(packId: string): void {
      const had = byPack.delete(packId);
      if (sectionsByPack.delete(packId) || had) rebuild();
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

/** Each pack's bundled articles, qualified by pack and isolated from malformed contributions. */
export function createHelpStore() {
  const byPack = new Map<string, HelpCatalog>();
  return {
    register(packId: string, help?: HelpDocument[], packName = packId): void {
      byPack.delete(packId);
      if (help === undefined) return;
      const ids = new Set<string>();
      const problems: HelpProblem[] = [];
      const invalid = !Array.isArray(help) || help.some(article => {
        if (!article || typeof article.id !== 'string' || !article.id
          || typeof article.title !== 'string' || !article.title.trim() || typeof article.body !== 'string'
          || (article.order !== undefined && !Number.isFinite(article.order))
          || (article.features !== undefined && (!Array.isArray(article.features) || article.features.some(f => typeof f !== 'string')))
          || ids.has(article.id)) return true;
        ids.add(article.id);
        return false;
      });
      if (invalid) {
        problems.push({ packId, message: 'This pack supplied invalid or duplicate help articles. Rebuild or update the pack.' });
      }
      byPack.set(packId, { articles: problems.length ? [] : help.map(article => ({ ...article, packId, packName })), problems });
    },
    unregister(packId: string): void { byPack.delete(packId); },
    all: (): HelpCatalog => ({
      articles: [...byPack.values()].flatMap(c => c.articles).sort((a, b) =>
        a.packName.localeCompare(b.packName) || a.packId.localeCompare(b.packId)
        || (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title)),
      problems: [...byPack.values()].flatMap(c => c.problems),
    }),
  };
}
