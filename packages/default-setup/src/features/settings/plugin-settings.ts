// A plugin's slice of the settings, by the name code writes for it: this pack's features by id, another
// pack's as `<packId>/<featureId>`. The settings hold each slice under the plugin's ref, which this resolves
// the way a send does, so no reader indexes `settings.plugins` by hand.
import { splitRef } from '@abuddy/sdk/ids';
import { ref } from '@/__generated__/ref';

type WithPlugins = { plugins?: Record<string, unknown> } | null | undefined;

/**
 * The key a plugin's settings are stored under: its ref, `<packId>/<featureId>`. The settings store and the settings
 * service take only keys, whoever calls them, so a bare name can't be read in one pack's context and written in
 * another's; a name resolves where it is written (`pluginSettingsKey`), and actions write the ref itself.
 */
export type PluginSettingsKey = `${string}/${string}`;

export function pluginSettings<T = Record<string, any>>(settings: WithPlugins, name: string): T | undefined {
  return settings?.plugins?.[ref(name)] as T | undefined;
}

/**
 * The key a plugin's settings are stored under, for the name this pack's code writes. The settings system takes
 * only keys, so every plugin label is resolved here before it is sent.
 */
export function pluginSettingsKey(name: string): PluginSettingsKey {
  return ref(name);
}

/**
 * `key`, when it is one the plugin settings are stored under: a plugin's ref. A name reaching the store
 * unresolved would write a slice no reader looks at, so it throws instead.
 */
export function checkedPluginSettingsKey(key: string): PluginSettingsKey {
  if (splitRef(key)) return key as PluginSettingsKey;
  throw new Error(`"${key}" isn't a plugin settings key: a plugin's settings are stored under its ref, "<packId>/<featureId>" (pluginSettingsKey resolves a name)`);
}
