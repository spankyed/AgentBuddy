// A plugin's slice of the settings, by the name code writes for it: this pack's features by id, another
// pack's as `<packId>/<featureId>`. The settings hold each slice under the plugin's ref, which `ref(name)` resolves
// the way a send does, so no reader indexes `settings.plugins` by hand.
import { splitRef, type FeatureRef } from '@abuddy/sdk/ids';
import { ref } from '@/__generated__/ref';

type WithPlugins = { plugins?: Record<string, unknown> } | null | undefined;

export function pluginSettings<T = Record<string, any>>(settings: WithPlugins, name: string): T | undefined {
  return settings?.plugins?.[ref(name)] as T | undefined;
}

/**
 * `key` as the ref a plugin's settings are stored under. What reaches the store as a string (an action's
 * `'default-setup/code'`, a client's send) is checked here once: a name reaching the store unresolved would be
 * read in one pack's context and written in another's, so it throws instead.
 */
export function checkedSettingsRef(key: string): FeatureRef {
  if (splitRef(key)) return key as FeatureRef;
  throw new Error(`"${key}" isn't a plugin settings key: a plugin's settings are stored under its ref, "<packId>/<featureId>"`);
}
