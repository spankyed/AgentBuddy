import type { Component } from 'vue';
import type { PluginDefinition } from './plugin.ts';
import type { TiptapPlugin } from './tiptap-plugins.ts';
import type { DslTypeConfig } from './dsl-types.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { StepDefinition } from '../steps/types.ts';

/** What a pack's generated FE entry registers with the host. */
export interface PackFERegistration {
  /** The pack this is the frontend of, as `PackRegistration.id` is for its backend */
  id: string;
  /** Feature id → its plugin. The host registers each at the feature's address, `<packId>.<featureId>` */
  plugins?: Record<string, PluginDefinition>;
  /** The feature whose plugin opens by default, unless another pack's already does */
  defaultPlugin?: string;
  steps?: StepDefinition[];
  tiptapPlugins?: TiptapPlugin[];
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  /** DSL types for the host's code editors, by name (abuddy.json `dsl` entries with a `monaco` target) */
  dslTypes?: Record<string, DslTypeConfig>;
  /** Role → the feature playing it (abuddy.json `features[].designation`); the host resolves it to the plugin */
  designations?: Record<string, string>;
}
