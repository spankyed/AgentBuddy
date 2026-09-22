// A plugin's slice of the settings, by the name code writes for it: this pack's features by id, another
// pack's as `<packId>/<featureId>`. The settings hold each slice under the plugin's ref, which `ref(name)` resolves
// the way a send does, so no reader indexes `settings.plugins` by hand.
import { ref, type FeatureName } from '@/__generated__/ref';

type WithPlugins = { plugins?: Record<string, unknown> } | null | undefined;

export function pluginSettings<T = Record<string, any>>(settings: WithPlugins, name: FeatureName): T | undefined {
  return settings?.plugins?.[ref(name)] as T | undefined;
}
