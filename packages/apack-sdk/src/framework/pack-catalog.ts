import { boundHost } from '../runtime/host-runtime.ts';
import type { SettingsDefinition } from './settings-definition.ts';
import type { PluginDeclaration } from './plugin-declaration.ts';

/** Native composition data, admitted independently of its executable bindings. */
export interface NativePackDeclaration {
  id: string;
  dependencies?: Record<string, string>;
  settings?: Record<string, SettingsDefinition>;
  features?: Record<string, { settings?: SettingsDefinition; plugin?: PluginDeclaration }>;
}

/** Observe committed declaration changes, independently of executable pack activation. */
export function onPackCatalogChanged(listener: () => void): () => void {
  return boundHost().packs.onCatalogChanged(listener);
}
