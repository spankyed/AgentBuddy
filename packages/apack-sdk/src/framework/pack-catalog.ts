import type { PackLifecycleDeclaration } from './lifecycle-declaration.ts';
import type { PackDataDeclarations } from './data-declaration.ts';
import { boundHost } from '../runtime/host-runtime.ts';
import type { SettingsDefinition } from './settings-definition.ts';
import type { ReferenceDeclarations } from './reference-declaration.ts';
import type { PluginDeclaration } from './plugin-declaration.ts';

/** Native composition data, admitted independently of its executable bindings. */
export interface NativePackDeclaration extends PackDataDeclarations {
  id: string;
  lifecycle?: PackLifecycleDeclaration;
  dependencies?: Record<string, string>;
  settings?: Record<string, SettingsDefinition>;
  features?: Record<string, { entities?: Record<string, string | null>; settings?: SettingsDefinition; plugin?: PluginDeclaration; references?: ReferenceDeclarations }>;
}

/** Observe committed declaration changes, independently of executable pack activation. */
export function onPackCatalogChanged(listener: () => void): () => void {
  return boundHost().packs.onCatalogChanged(listener);
}
