import type { Component } from 'vue';
import type { Plugin } from './plugin';
import type { TiptapPlugin } from './components/tiptap/injection-keys';
import type { ArtifactDefinition } from '../artifacts/types';
import type { BlockDefinition } from '../blocks/types';
import type { StepDefinition } from '../steps/types';
import { registerDesignations } from '../designations/index';
import { registerAppExtension } from './app-extensions';
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

const allPlugins: Plugin[] = [];
let defaultPlugin: Plugin | undefined;

export function registerPackFE(registration: PackFERegistration): void {
  const plugins = registration.plugins ?? [];
  allPlugins.push(...plugins);

  if (registration.defaultPlugin && !defaultPlugin) {
    defaultPlugin = registration.defaultPlugin;
  } else if (registration.defaultPlugin) {
    console.warn(`[pack-store] defaultPlugin from pack ignored — already set`);
  }

  const designated = plugins.filter(p => p.designation);
  if (designated.length) {
    registerDesignations(designated.map(p => p.designation!));
  }

  if (registration.tiptapPlugins) {
    for (const plugin of registration.tiptapPlugins) {
      tiptapPluginRegistry.register(plugin);
    }
  }

  if (registration.appExtensions) {
    for (const [slot, component] of Object.entries(registration.appExtensions)) {
      registerAppExtension(slot, component);
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
