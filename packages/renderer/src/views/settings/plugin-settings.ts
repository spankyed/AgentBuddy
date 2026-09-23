// A plugin's slice of the settings, by its ref. The settings hold each slice under the plugin's ref, so no reader
// indexes `plugins` by hand. In the app's Settings view the refs come from the registered plugins, not from a
// pack's names, so this takes a ref rather than a name.
import type { FeatureRef } from '@abuddy/sdk/ids';

type WithPlugins = { plugins?: Record<string, unknown> } | null | undefined;

export function pluginSettings<T = Record<string, unknown>>(settings: WithPlugins, plugin: FeatureRef): T | undefined {
  return settings?.plugins?.[plugin] as T | undefined;
}
