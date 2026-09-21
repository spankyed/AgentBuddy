// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig } from '@abuddy/sdk/fe';
import type { FePackRegistryView } from '@abuddy/sdk/runtime';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { createDefinitionStore, createDesignationStore, createOwnedStore, createStepStore, createUndoLog } from '../packs/extensions.ts';
import { qualifiedId } from '@abuddy/sdk/ids';
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
  /** Registers a pack's frontend and returns the plugins it registered, under the ids they run under */
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
      // A plugin runs under `<packId>.<featureId>`, as a system does, so two packs can each have a `notes`
      // feature and neither shadows the other. A built pack names its plugin with the generated `pluginId`
      // map, so its module already carries that id; a hand-written one names the feature and is qualified
      // here. Bare or prefixed both resolve, as they do for a system id.
      //
      // Since a pack registering twice is already refused, what is left for the duplicate guard below to
      // catch is one registration naming a feature twice — which codegen cannot emit and a hand-written
      // one can.
      const registeredIds = new Set(allPlugins.map(p => p.id));
      const plugins: Plugin[] = [];
      const qualified = new Map<string, Plugin>();
      const prefix = `${packId}.`;
      /** The feature a name refers to, whether it is written bare or already carries this pack's prefix */
      const featureOf = (name: string): string => (name.startsWith(prefix) ? name.slice(prefix.length) : name);
      for (const plugin of registration.plugins ?? []) {
        const id = plugin.id.startsWith(prefix) ? plugin.id : qualifiedId(packId, plugin.id);
        if (registeredIds.has(id)) {
          console.warn(`[pack-store] Plugin "${id}"${fromPack} ignored — a plugin with that id is already registered`);
          continue;
        }
        registeredIds.add(id);
        const registered = plugin.id === id ? plugin : { ...plugin, id };
        // Keyed by the feature id, which is how `designations` and `defaultPlugin` name it
        qualified.set(featureOf(id), registered);
        plugins.push(registered);
      }
      allPlugins.push(...plugins);
      undo(() => {
        for (const plugin of plugins) {
          const idx = allPlugins.indexOf(plugin);
          if (idx >= 0) allPlugins.splice(idx, 1);
        }
      });

      const ownDefault = registration.defaultPlugin && qualified.get(featureOf(registration.defaultPlugin.id));
      if (ownDefault && !defaultPlugin) {
        defaultPlugin = ownDefault;
        undo(() => { defaultPlugin = undefined; });
      } else if (registration.defaultPlugin) {
        const reason = ownDefault ? 'another pack is already the default' : "it isn't one of this pack's plugins";
        console.warn(`[pack-store] defaultPlugin "${registration.defaultPlugin.id}"${fromPack} ignored — ${reason}`);
      }

      // From the registration's own map, and resolved through the plugins this registration actually
      // registered: a designation names a feature, and a feature it didn't register plays no role here.
      const roles: Record<string, string> = {};
      for (const [designation, featureId] of Object.entries(registration.designations ?? {})) {
        const pluginId = qualified.get(featureOf(featureId))?.id;
        if (!pluginId) continue;
        if (designations.has(designation)) {
          console.warn(`[pack-store] Designation "${designation}" of plugin "${pluginId}"${fromPack} ignored — another plugin plays that role`);
        } else {
          roles[designation] = pluginId;
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
      // What was registered, not what the registration held: the caller adds these to the app, and the
      // pack's own modules still carry the bare feature ids their author wrote.
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
