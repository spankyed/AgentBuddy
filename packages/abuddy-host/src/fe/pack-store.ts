// The packs whose frontends the renderer registered, as an instance: the renderer creates one and binds its read
// face for the SDK's frontend lookups (`bindFeHost({ packs })`). It holds the only writes to it.
import type { Plugin, PackFERegistration, TiptapPlugin, DslTypeConfig } from '@abuddy/sdk/fe';
import type { FePackRegistryView } from '@abuddy/sdk/runtime';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { createDefinitionStore, createDesignationStore, createOwnedStore, createStepStore } from '../packs/extensions.ts';
import { createAppExtensionSlots } from './app-extensions.ts';

interface PackFEExtensions {
  /** The plugins this pack added: not those skipped because another pack or the host has the id */
  plugins: Plugin[];
  stepTypes: string[];
  tiptapPlugins: TiptapPlugin[];
  appExtensionSlots: string[];
  artifactTypes: string[];
  blockTypes: string[];
  dslTypes: string[];
  /** Role → id of the plugin that plays it */
  designations: Record<string, string>;
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
    const fromPack = packId ? ` from pack ${packId}` : '';
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

    if (registration.defaultPlugin && !defaultPlugin) {
      defaultPlugin = registration.defaultPlugin;
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

    tiptapPlugins.push(...registration.tiptapPlugins ?? []);

    // Built-in packs register without a pack id and are never unregistered, so they share one owner
    const owner = packId ?? BUILT_IN_OWNER;
    const appExtensionSlots: string[] = [];
    for (const [slot, component] of Object.entries(registration.appExtensions ?? {})) {
      appExtensions.register(slot, component, owner);
      appExtensionSlots.push(slot);
    }

    for (const def of registration.artifacts ?? []) artifacts.register(def, owner);
    for (const def of registration.blocks ?? []) blocks.register(def, owner);

    if (registration.steps) {
      for (const step of registration.steps) steps.register(step, owner);
      // Each step's components, loaded once
      for (const def of steps.all()) {
        if (def.fe?.loadComponents && !def.fe.components) def.fe.components = def.fe.loadComponents();
      }
    }

    for (const [name, config] of Object.entries(registration.dslTypes ?? {})) dslTypes.set(name, config, owner);

    if (packId) {
      packExtensions.set(packId, {
        plugins,
        stepTypes: (registration.steps ?? []).map(s => s.type),
        tiptapPlugins: registration.tiptapPlugins ?? [],
        appExtensionSlots,
        artifactTypes: (registration.artifacts ?? []).map(a => a.type),
        blockTypes: (registration.blocks ?? []).map(b => b.type),
        dslTypes: Object.keys(registration.dslTypes ?? {}),
        designations: roles,
      });
    }
  }

  function unregisterPackFE(packId: string): Plugin[] {
    const contrib = packExtensions.get(packId);
    if (!contrib) return [];

    const removedPlugins: Plugin[] = [];
    for (const plugin of contrib.plugins) {
      const idx = allPlugins.indexOf(plugin);
      if (idx >= 0) {
        removedPlugins.push(plugin);
        allPlugins.splice(idx, 1);
      }
    }

    for (const type of contrib.stepTypes) steps.unregister(type, packId);
    for (const type of contrib.artifactTypes) artifacts.unregister(type, packId);
    for (const type of contrib.blockTypes) blocks.unregister(type, packId);
    for (const slot of contrib.appExtensionSlots) appExtensions.unregister(slot, packId);
    for (const name of contrib.dslTypes) dslTypes.remove(name, packId);
    for (const plugin of contrib.tiptapPlugins) {
      const idx = tiptapPlugins.indexOf(plugin);
      if (idx >= 0) tiptapPlugins.splice(idx, 1);
    }
    designations.unregister(contrib.designations);

    packExtensions.delete(packId);
    return removedPlugins;
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
