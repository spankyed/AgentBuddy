// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig } from '@abuddy/sdk/fe';
import type { FePackRegistryView } from '@abuddy/sdk/runtime';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { createDefinitionStore, createDesignationStore, createOwnedStore, createStepStore, createUndoLog } from '../packs/extensions.ts';
import { createAppExtensionSlots } from './app-extensions.ts';

interface PackFEExtensions {
  /** The plugins this pack added: not those skipped because another pack or the host has the id */
  plugins: Plugin[];
  /**
   * Everything it added, as the way to take it back out, recorded where each one is added.
   *
   * It was a field per kind of contribution, which made recording one compulsory and undoing it optional:
   * a new kind added to the register path and forgotten in the unregister path leaked, with nothing saying
   * so. The backend registry takes its pack's contributions back out the same way.
   */
  undo: () => unknown;
}

/** The renderer's registered pack frontends */
export interface FePackRegistry extends FePackRegistryView {
  /** Registers a pack's frontend; without a pack id (the built-in packs') it can't be unregistered */
  registerPackFE(registration: PackFERegistration, packId?: string): void;
  /** Unregisters a pack's frontend; returns the plugins it had added */
  unregisterPackFE(packId: string): Plugin[];
  /** Every registered plugin, in registration order */
  getRegisteredPlugins(): Plugin[];
  /** The first registered default plugin; throws when no pack registered one */
  getRegisteredDefaultPlugin(): Plugin;
  getAppExtension(slot: string): ReturnType<FePackRegistryView['appExtension']>;
}

/** A new, empty frontend registry */
export function createFePackRegistry(): FePackRegistry {
  const allPlugins: Plugin[] = [];
  let defaultPlugin: Plugin | undefined;
  const packExtensions = new Map<string, PackFEExtensions>();
  const designations = createDesignationStore();
  /** The owner recorded for contributions that arrive without a pack id (the built-in packs') */
  const BUILT_IN_OWNER = '<built-in>';
  const steps = createStepStore();
  const artifacts = createDefinitionStore<ArtifactDefinition>();
  const blocks = createDefinitionStore<BlockDefinition>();
  const tiptapPlugins: TiptapPlugin[] = [];
  const appExtensions = createAppExtensionSlots();
  const dslTypes = createOwnedStore<DslTypeConfig>();

  function registerPackFE(registration: PackFERegistration, packId?: string): void {
    if (packId && packExtensions.has(packId)) {
      throw new Error(`Pack "${packId}" frontend is already registered`);
    }
    const fromPack = packId ? ` from pack ${packId}` : '';
    // A registration is all or nothing. What a pack contributes is registered as it is read, and some of it
    // is the pack's own code — a step's `loadComponents` runs here — so a throw partway has to leave the
    // registry as it found it. Without this the pack is half-registered with nothing recording what, so it
    // can never be unregistered, and its plugins stay in the list for the life of the app.
    const undos = createUndoLog();
    const undo = undos.record;

    try {
      const registeredIds = new Set(allPlugins.map(p => p.id));
      const plugins: Plugin[] = [];
      for (const plugin of registration.plugins ?? []) {
        if (registeredIds.has(plugin.id)) {
          console.warn(`[pack-store] Plugin "${plugin.id}"${fromPack} ignored — a plugin with that id is already registered`);
          continue;
        }
        registeredIds.add(plugin.id);
        plugins.push(plugin);
      }
      allPlugins.push(...plugins);
      undo(() => {
        for (const plugin of plugins) {
          const idx = allPlugins.indexOf(plugin);
          if (idx >= 0) allPlugins.splice(idx, 1);
        }
      });

      if (registration.defaultPlugin && !defaultPlugin) {
        defaultPlugin = registration.defaultPlugin;
        undo(() => { defaultPlugin = undefined; });
      } else if (registration.defaultPlugin) {
        console.warn(`[pack-store] defaultPlugin from pack ignored — already set`);
      }

      const roles: Record<string, string> = {};
      for (const { id, designation } of plugins) {
        if (!designation) continue;
        if (designations.has(designation) || designation in roles) {
          console.warn(`[pack-store] Designation "${designation}" of plugin "${id}"${fromPack} ignored — another plugin plays that role`);
        } else {
          roles[designation] = id;
        }
      }
      designations.register(roles);
      undo(() => designations.unregister(roles));

      for (const plugin of registration.tiptapPlugins ?? []) {
        tiptapPlugins.push(plugin);
        undo(() => {
          const idx = tiptapPlugins.indexOf(plugin);
          if (idx >= 0) tiptapPlugins.splice(idx, 1);
        });
      }

      // Built-in packs register without a pack id and are never unregistered, so they share one owner
      const owner = packId ?? BUILT_IN_OWNER;
      for (const [slot, component] of Object.entries(registration.appExtensions ?? {})) {
        appExtensions.register(slot, component, owner);
        undo(() => appExtensions.unregister(slot, owner));
      }

      for (const def of registration.artifacts ?? []) {
        artifacts.register(def, owner);
        undo(() => artifacts.unregister(def.type, owner));
      }
      for (const def of registration.blocks ?? []) {
        blocks.register(def, owner);
        undo(() => blocks.unregister(def.type, owner));
      }

      const touchedSteps = new Set<string>();
      for (const step of registration.steps ?? []) {
        steps.register(step, owner);
        touchedSteps.add(step.type);
        undo(() => steps.unregister(step.type, owner));
      }
      // Each step's components, loaded once — for the types this registration touched and no others. Their
      // merged definition is the only one that changed, and `loadComponents` is the pack's own code: running
      // another pack's here would make its failure this pack's, and a step left broken by a pack that failed
      // would throw again for every pack registered after it.
      for (const type of touchedSteps) {
        const def = steps.get(type);
        if (def?.fe?.loadComponents && !def.fe.components) def.fe.components = def.fe.loadComponents();
      }

      for (const [name, config] of Object.entries(registration.dslTypes ?? {})) {
        dslTypes.set(name, config, owner);
        undo(() => dslTypes.remove(name, owner));
      }

      if (packId) packExtensions.set(packId, { plugins, undo: undos.undoAll });
    } catch (err) {
      undos.undoAll();
      throw err;
    }
  }

  function unregisterPackFE(packId: string): Plugin[] {
    const contrib = packExtensions.get(packId);
    if (!contrib) return [];

    contrib.undo();
    packExtensions.delete(packId);
    return contrib.plugins;
  }

  return {
    registerPackFE,
    unregisterPackFE,
    getRegisteredPlugins: () => allPlugins,
    getRegisteredDefaultPlugin() {
      if (!defaultPlugin) {
        throw new Error('No default plugin registered. Ensure at least one pack calls registerPackFE() with a defaultPlugin.');
      }
      return defaultPlugin;
    },
    getAppExtension: appExtensions.get,

    // The SDK's frontend lookups (FePackRegistryView)
    designation: designations.get,
    step: steps.get,
    steps: steps.all,
    artifact: artifacts.get,
    artifacts: artifacts.all,
    block: blocks.get,
    blocks: blocks.all,
    plugins: () => allPlugins,
    defaultPlugin: () => defaultPlugin,
    tiptapPlugins: () => tiptapPlugins,
    appExtension: appExtensions.get,
    dslTypes: () => dslTypes.entries(),
  };
}
