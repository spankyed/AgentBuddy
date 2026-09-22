import type { Component } from 'vue';
import type { PluginDefinition } from './plugin.ts';
import type { TiptapPlugin } from './tiptap-plugins.ts';
import type { DslTypeConfig } from './dsl-types.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { StepDefinition } from '../steps/types.ts';

/** A feature's frontend: its plugin, the role it plays and whether it's the plugin to open by default */
export interface PackFEFeature {
  plugin: PluginDefinition;
  /** The role the feature plays (abuddy.json `features[].designation`) */
  designation?: string;
  /** This pack's plugin to open when the app starts */
  default?: true;
}

/** What a pack's generated FE entry registers with the host. */
export interface PackFERegistration {
  /** The pack this is the frontend of, as `PackRegistration.id` is for its backend */
  id: string;
  /** Feature id → its frontend, as `PackRegistration.features` is its backend. Each plugin runs at `<packId>/<featureId>` */
  features?: Record<string, PackFEFeature>;
  steps?: StepDefinition[];
  tiptapPlugins?: TiptapPlugin[];
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  /** DSL types for the host's code editors, by name (abuddy.json `dsl` entries with a `monaco` target) */
  dslTypes?: Record<string, DslTypeConfig>;
}
