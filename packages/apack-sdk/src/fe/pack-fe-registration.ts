import type { ReferenceBindings } from './reference-types.ts';
import type { Component } from 'vue';
import type { PluginDefinition } from './plugin.ts';
import type { TiptapPlugin } from './tiptap-plugins.ts';
import type { DslTypeConfig } from './dsl-types.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { StepDefinition } from '../steps/types.ts';

/**
 * A feature's frontend: its plugin, the role it plays and whether it's the plugin to open by default. A feature with
 * no plugin is listed for its role alone, so the frontend resolves every role the backend does
 */
export interface PackFEFeature {
  plugin?: PluginDefinition;
  /** Checked reference bindings owned by this feature. Discovery uses its declaration separately. */
  references?: ReferenceBindings;
  /** Custom presentation for this feature's declared preferences, independent of its plugin. */
  settingsForm?: Component;
  /** The role the feature plays (apack.json `features[].designation`) */
  designation?: string;
  /** This pack's plugin to open when the app starts; only a feature with a plugin claims it */
  default?: true;
}

/** What a pack's generated FE entry registers with the host. */
export interface PackFERegistration {
  /** Generated bindings identify the same declarations as the installed artifact. */
  declarationRevision?: string;
  /** The pack this is the frontend of, as `PackRegistration.id` is for its backend */
  id: string;
  /** Prepare caller-bound access; the host activates it at publication and disposes it on refusal or unload. */
  bindSettings?: (settings: import('./settings.ts').SettingsPort) => { activate(): void; dispose(): void };
  /** Feature id → its frontend, as `PackRegistration.features` is its backend. Each plugin runs at `<packId>/<featureId>` */
  features?: Record<string, PackFEFeature>;
  /** Pack settings group id → its declared custom form. */
  settingsForms?: Record<string, Component>;
  steps?: StepDefinition[];
  tiptapPlugins?: TiptapPlugin[];
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  /** DSL types for the host's code editors, by name (apack.json `dsl` entries with a `monaco` target) */
  dslTypes?: Record<string, DslTypeConfig>;
}
