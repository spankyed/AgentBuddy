import type { Component } from 'vue';
import type { Plugin } from './plugin';
import type { TiptapPlugin } from './components/tiptap/injection-keys';
import type { ArtifactDefinition } from '../artifacts/types';
import type { BlockDefinition } from '../blocks/types';
import type { StepDefinition } from '../steps/types';
import { registerDesignations, unregisterDesignations } from '../designations/index';
import { registerAppExtension, unregisterAppExtension } from './app-extensions';
import { tiptapPluginRegistry } from './components/tiptap/registry';
import { artifactRegistry } from '../artifacts/registry';
import { blockRegistry } from '../blocks/registry';
import { stepRegistry } from '../steps/registry';

export interface PackFERegistration {
  plugins?: Plugin[];
  defaultPlugin?: Plugin;
  steps?: StepDefinition[];
  tiptapPlugins?: TiptapPlugin[];
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
}

interface PackFEContributions {
  pluginIds: string[];
  stepTypes: string[];
  tiptapPluginCount: number;
  appExtensionSlots: string[];
  artifactTypes: string[];
  blockTypes: string[];
  designations: string[];
}

const allPlugins: Plugin[] = [];
let defaultPlugin: Plugin | undefined;
const packContributions = new Map<string, PackFEContributions>();

export function registerPackFE(registration: PackFERegistration, packId?: string): void {
  const plugins = registration.plugins ?? [];
  allPlugins.push(...plugins);

  if (registration.defaultPlugin && !defaultPlugin) {
    defaultPlugin = registration.defaultPlugin;
  } else if (registration.defaultPlugin) {
    console.warn(`[pack-store] defaultPlugin from pack ignored — already set`);
  }

  const designations = plugins.filter(p => p.designation).map(p => p.designation!);
  if (designations.length) {
    registerDesignations(designations);
  }

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
      pluginIds: plugins.map(p => p.id),
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
  for (const pluginId of contrib.pluginIds) {
    const idx = allPlugins.findIndex(p => p.id === pluginId);
    if (idx >= 0) {
      removedPlugins.push(allPlugins[idx]);
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

  if (contrib.designations.length) {
    unregisterDesignations(contrib.designations);
  }

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
