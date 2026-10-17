import type { z } from 'zod';
import type { ArtifactEntrySchema, BlockEntrySchema, CommandEntrySchema, DslEntrySchema, StepEntrySchema } from './declaration-schema.ts';
import type { PackLifecycleDeclaration } from './lifecycle-declaration.ts';
import type { PackDataDeclarations } from './data-declaration.ts';
import { boundHost } from '../runtime/host-runtime.ts';
import type { SettingsDefinition } from './settings-definition.ts';
import type { DeclarationData } from './catalog-view.ts';
import type { ReferenceDeclarations } from './reference-declaration.ts';
import type { PluginDeclaration } from './plugin-declaration.ts';
import type { FrontendDeclaration } from './frontend-declaration.ts';

/** Native composition data, admitted independently of its executable bindings. */
export interface NativePackDeclaration extends PackDataDeclarations, FrontendDeclaration {
  id: string;
  lifecycle?: PackLifecycleDeclaration;
  /** Native writers and explicitly applied content; compilation and automatic application belong to installed builds. */
  content?: {
    writers?: Record<string, string>;
    sources?: Record<string, { applier: string }>;
  };
  steps?: Record<string, z.infer<typeof StepEntrySchema>>;
  artifacts?: Record<string, z.infer<typeof ArtifactEntrySchema>>;
  blocks?: Record<string, z.infer<typeof BlockEntrySchema>>;
  commands?: Record<string, z.infer<typeof CommandEntrySchema>>;
  dsl?: Record<string, DeclarationData<z.infer<typeof DslEntrySchema>>>;
  /** Compiled type data supplied by native composition, independently of frontend activation. */
  dslDefinitions?: Record<string, string>;
  /** Compiled entity wire name to local plugin feature, supplied by native composition. */
  entityDestinations?: Record<string, string>;
  /** Static transport contracts, including native inboxes without contributed UI panes. */
  eventContracts?: import('./event-contracts.ts').PackEventContracts;
  dependencies?: Record<string, string>;
  settings?: Record<string, SettingsDefinition>;
  /** Native APIs without a feature owner; values identify their composition bindings. */
  services?: Record<string, string>;
  repositories?: Record<string, string>;
  features?: Record<string, {
    description: string;
    entities?: Record<string, string | null>;
    designation?: string;
    settings?: SettingsDefinition;
    plugin?: PluginDeclaration;
    references?: ReferenceDeclarations;
    services?: Record<string, string>;
    repositories?: Record<string, string>;
  }>;
}

/** Observe committed declaration changes, independently of executable pack activation. */
export function onPackCatalogChanged(listener: () => void): () => void {
  return boundHost().packs.onCatalogChanged(listener);
}
