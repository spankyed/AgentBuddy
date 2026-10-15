import type { z } from 'zod';
import type { ArtifactEntrySchema, BlockEntrySchema, DslEntrySchema, StepEntrySchema } from './declaration-schema.ts';
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
  steps?: Record<string, z.infer<typeof StepEntrySchema>>;
  artifacts?: Record<string, z.infer<typeof ArtifactEntrySchema>>;
  blocks?: Record<string, z.infer<typeof BlockEntrySchema>>;
  dsl?: Record<string, DeclarationData<z.infer<typeof DslEntrySchema>>>;
  dependencies?: Record<string, string>;
  settings?: Record<string, SettingsDefinition>;
  features?: Record<string, { description: string; entities?: Record<string, string | null>; designation?: string; settings?: SettingsDefinition; plugin?: PluginDeclaration; references?: ReferenceDeclarations }>;
}

/** Observe committed declaration changes, independently of executable pack activation. */
export function onPackCatalogChanged(listener: () => void): () => void {
  return boundHost().packs.onCatalogChanged(listener);
}
