import type { Component } from 'vue';
import type { Plugin } from './plugin.ts';
import type { TiptapPlugin } from './tiptap-plugins.ts';
import type { DslTypeConfig } from './dsl-types.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { StepDefinition } from '../steps/types.ts';

/** What a pack's generated FE entry registers with the host. */
export interface PackFERegistration {
  /** The pack this is the frontend of, as `PackRegistration.id` is for its backend */
  id: string;
  plugins?: Plugin[];
  defaultPlugin?: Plugin;
  steps?: StepDefinition[];
  tiptapPlugins?: TiptapPlugin[];
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  /** DSL types for the host's code editors, by name (abuddy.json `dsl` entries with a `monaco` target) */
  dslTypes?: Record<string, DslTypeConfig>;
  /**
   * The roles this pack's features play, already resolved to plugin ids (abuddy.json
   * `features[].designation`).
   *
   * A map rather than a field on each plugin: a designation is a property of a feature, and this
   * registration carries no features. Set on the plugin it was a binding the author could fill and codegen
   * would then overwrite, which failed silently when the two disagreed.
   */
  designations?: Record<string, string>;
}
