import type { ReferenceBindings } from './reference-types.ts';
import type { Component } from 'vue';
import type { SurfaceDefinition } from './surface.ts';
import type { TextEditorExtensions } from './text-editor-extensions.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { StepDefinition } from '../steps/types.ts';

/**
 * A feature's frontend: its surface, the role it plays and whether it's the surface to open by default. A feature with
 * no surface is listed for its role alone, so the frontend resolves every role the backend does
 */
export interface PackFEFeature {
  surface?: SurfaceDefinition;
  /** Checked reference bindings owned by this feature. Discovery uses its declaration separately. */
  references?: ReferenceBindings;
  /** Custom presentation for this feature's declared preferences, independent of its surface. */
  settingsForm?: Component;
  /** The role the feature plays (apack.json `features[].designation`) */
  designation?: string;
  /** This pack's surface to open when the app starts; only a feature with a surface claims it */
  default?: true;
}

/** What a pack's generated FE entry registers with the host. */
export interface PackFERegistration {
  /** Generated bindings identify the same declarations as the installed build. */
  declarationRevision?: string;
  /** The pack this is the frontend of, as `PackRegistration.id` is for its backend */
  id: string;
  /** Prepare caller-bound access; the host activates it at publication and disposes it on refusal or unload. */
  bindSettings?: (settings: import('./settings.ts').SettingsPort) => { activate(): void; dispose(): void };
  /** Feature id → its frontend, as `PackRegistration.features` is its backend. Each surface runs at `<packId>/<featureId>` */
  features?: Record<string, PackFEFeature>;
  /** Pack settings group id → its declared custom form. */
  settingsForms?: Record<string, Component>;
  steps?: StepDefinition[];
  textEditor?: Record<string, TextEditorExtensions>;
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
}
