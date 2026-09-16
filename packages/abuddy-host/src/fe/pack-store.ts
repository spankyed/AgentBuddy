import type { Plugin, PackFERegistration } from '@abuddy/sdk/fe';
import { tiptapPluginRegistry } from '@abuddy/sdk/fe';
import { hasDesignation, registerDesignations, unregisterDesignations } from '@abuddy/sdk/designations';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { blockRegistry } from '@abuddy/sdk/blocks';
import { stepRegistry } from '@abuddy/sdk/steps';
import { registerAppExtension, unregisterAppExtension } from './app-extensions.ts';

interface PackFEContributions {
  /** The plugins this pack added: not those skipped because another pack or the host has the id */
  plugins: Plugin[];
  stepTypes: string[];
  tiptapPluginCount: number;
  appExtensionSlots: string[];
  artifactTypes: string[];
  blockTypes: string[];
  /** Role → id of the plugin that plays it */
  designations: Record<string, string>;
}

const allPlugins: Plugin[] = [];
let defaultPlugin: Plugin | undefined;
const packContributions = new Map<string, PackFEContributions>();

export function registerPackFE(registration: PackFERegistration, packId?: string): void {
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

  const designations: Record<string, string> = {};
  for (const { id, designation } of plugins) {
    if (!designation) continue;
    if (hasDesignation(designation) || designation in designations) {
      console.warn(`[pack-store] Designation "${designation}" of plugin "${id}"${fromPack} ignored — another plugin plays that role`);
    } else {
      designations[designation] = id;
    }
  }
  registerDesignations(designations);

  if (registration.tiptapPlugins) {
    for (const plugin of registration.tiptapPlugins) {
      tiptapPluginRegistry.register(plugin, packId);
    }
  }

  const appExtensionSlots: string[] = [];
  if (registration.appExtensions) {
    for (const [slot, component] of Object.entries(registration.appExtensions)) {
      registerAppExtension(slot, component);
      appExtensionSlots.push(slot);
    }
  }

  if (registration.artifacts) {
    for (const def of registration.artifacts) {
      artifactRegistry.register(def);
    }
  }

  if (registration.blocks) {
    for (const def of registration.blocks) {
      blockRegistry.register(def);
    }
  }

  if (registration.steps) {
    for (const step of registration.steps) {
      stepRegistry.register(step);
    }
    stepRegistry.initComponents();
  }

  if (packId) {
    packContributions.set(packId, {
      plugins,
      stepTypes: (registration.steps ?? []).map(s => s.type),
      tiptapPluginCount: registration.tiptapPlugins?.length ?? 0,
      appExtensionSlots,
      artifactTypes: (registration.artifacts ?? []).map(a => a.type),
      blockTypes: (registration.blocks ?? []).map(b => b.type),
      designations,
    });
  }
}

export function unregisterPackFE(packId: string): Plugin[] {
  const contrib = packContributions.get(packId);
  if (!contrib) return [];

  const removedPlugins: Plugin[] = [];
  for (const plugin of contrib.plugins) {
    const idx = allPlugins.indexOf(plugin);
    if (idx >= 0) {
      removedPlugins.push(plugin);
      allPlugins.splice(idx, 1);
    }
  }

  for (const type of contrib.stepTypes) stepRegistry.unregister(type);
  for (const type of contrib.artifactTypes) artifactRegistry.unregister(type);
  for (const type of contrib.blockTypes) blockRegistry.unregister(type);
  for (const slot of contrib.appExtensionSlots) unregisterAppExtension(slot);

  if (contrib.tiptapPluginCount > 0) {
    tiptapPluginRegistry.unregisterAll(packId);
  }

  unregisterDesignations(contrib.designations);

  packContributions.delete(packId);
  return removedPlugins;
}

export function getRegisteredPlugins(): Plugin[] {
  return allPlugins;
}

export function getRegisteredDefaultPlugin(): Plugin {
  if (!defaultPlugin) {
    throw new Error('No default plugin registered. Ensure at least one pack calls registerPackFE() with a defaultPlugin.');
  }
  return defaultPlugin;
}
