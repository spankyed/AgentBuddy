// A feature's slice of the settings, by its ref. The settings hold each slice under the feature's ref, so no reader
// indexes `features` by hand. In the app's Settings view the refs come from the registered features, not from a
// pack's names, so this takes a ref rather than a name.
import type { FeatureRef } from '@apackdev/sdk/ids';

type WithFeatures = { features?: Record<string, unknown> } | null | undefined;

export function featureSettings<T = Record<string, unknown>>(settings: WithFeatures, feature: FeatureRef): T | undefined {
  return settings?.features?.[feature] as T | undefined;
}
