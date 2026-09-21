// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig } from '@abuddy/sdk/fe';
import type { FePackRegistryView } from '@abuddy/sdk/runtime';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { createDefinitionStore, createDesignationStore, createOwnedStore, createStepStore, createUndoLog } from '../packs/extensions.ts';
import { resolveName, type FeatureRef } from '@abuddy/sdk/ids';
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
  /** Registers a pack's frontend, and returns its plugins as registered: each at its feature's address */
  registerPackFE(registration: PackFERegistration): Plugin[];
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
  const steps = createStepStore();
  const artifacts = createDefinitionStore<ArtifactDefinition>();
  const blocks = createDefinitionStore<BlockDefinition>();
  const tiptapPlugins: TiptapPlugin[] = [];
  const appExtensions = createAppExtensionSlots();
  const dslTypes = createOwnedStore<DslTypeConfig>();

  function registerPackFE(registration: PackFERegistration): Plugin[] {
    const packId = registration.id;
    if (packExtensions.has(packId)) {
      throw new Error(`Pack "${packId}" frontend is already registered`);
    }
    const fromPack = ` from pack ${packId}`;
    // A registration is all or nothing. What a pack contributes is registered as it is read, and some of it
    // is the pack's own code — a step's `loadComponents` runs here — so a throw partway has to leave the
    // registry as it found it. Without this the pack is half-registered with nothing recording what, so it
    // can never be unregistered, and its plugins stay in the list for the life of the app.
    const undos = createUndoLog();
    const undo = undos.record;

    try {
      // The registration names features; each plugin is registered at its feature's address, as
      // `registerPack` addresses `features`, so no pack's plugin can land in another's namespace
      const byFeature = new Map(Object.entries(registration.plugins ?? {})
        .map(([featureId, definition]) => [featureId, { ...definition, id: resolveName(featureId, { packId }) } as Plugin]));
      const plugins = [...byFeature.values()];
      allPlugins.push(...plugins);
      undo(() => {
        for (const plugin of plugins) allPlugins.splice(allPlugins.indexOf(plugin), 1);
      });

      const ownDefault = registration.defaultPlugin === undefined ? undefined : byFeature.get(registration.defaultPlugin);
      if (ownDefault && !defaultPlugin) {
        defaultPlugin = ownDefault;
        undo(() => { defaultPlugin = undefined; });
      } else if (registration.defaultPlugin !== undefined) {
        const reason = ownDefault ? 'another pack is already the default' : "it isn't one of this pack's plugins";
        console.warn(`[pack-store] defaultPlugin "${registration.defaultPlugin}"${fromPack} ignored — ${reason}`);
      }

      const roles: Record<string, FeatureRef> = {};
      for (const [designation, featureId] of Object.entries(registration.designations ?? {})) {
        const plugin = byFeature.get(featureId);
        if (!plugin) continue;
        if (designations.has(designation)) {
          console.warn(`[pack-store] Designation "${designation}" of plugin "${plugin.id}"${fromPack} ignored — another plugin plays that role`);
        } else {
          roles[designation] = plugin.id;
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

      const owner = packId;
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

      for (const step of registration.steps ?? []) {
        steps.register(step, owner);
        undo(() => steps.unregister(step.type, owner));
        // Its components, loaded once, off the pack's own `fe` — which is the object every merged
        // definition of the type hands out, since merging keeps the facet by reference. Loading them here
        // rather than sweeping the registry afterwards is what keeps `loadComponents`, which is the pack's
        // own code, from running inside another pack's registration and failing it.
        if (step.fe?.loadComponents && !step.fe.components) step.fe.components = step.fe.loadComponents();
      }

      for (const [name, config] of Object.entries(registration.dslTypes ?? {})) {
        dslTypes.set(name, config, owner);
        undo(() => dslTypes.remove(name, owner));
      }

      packExtensions.set(packId, { plugins, undo: undos.undoAll });
      return plugins;
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
