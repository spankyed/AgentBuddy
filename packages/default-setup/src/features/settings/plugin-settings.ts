// A plugin's slice of the settings, by the name code writes for it: this pack's features by id, another
// pack's as `<packId>/<featureId>`. The settings hold each slice under the plugin's address, which this
// resolves the way a send does, so no reader indexes `settings.plugins` by hand.
import { resolveName } from '@abuddy/sdk/ids';
import { packId } from '@/__generated__/bus-ids';

type WithPlugins = { plugins?: Record<string, unknown> } | null | undefined;

export function pluginSettings<T = Record<string, any>>(settings: WithPlugins, name: string): T | undefined {
  return settings?.plugins?.[resolveName(name, { packId })] as T | undefined;
}

/** The reserved key inside `plugins` for the app's own metadata (visibility, the last-active plugin) */
export const PLUGIN_SETTINGS_META_KEY = '_meta';

/**
 * The key a plugin's settings are stored under, for the name this pack's code writes (`_meta` stays itself).
 * The settings system takes only keys, so every plugin label is resolved here before it is sent.
 */
export function pluginSettingsKey(name: string): string {
  return name === PLUGIN_SETTINGS_META_KEY ? name : resolveName(name, { packId });
}
