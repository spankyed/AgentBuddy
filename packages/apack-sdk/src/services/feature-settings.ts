import type { FeatureRef } from '../ids/index.ts';
import type { FeatureSettingsAccess } from '../types/settings.ts';
import type { SettingsService } from './settings.ts';

/** Used by generated pack accessors; refs are resolved in the calling pack's scope. */
export function _featureSettings<T>(feature: FeatureRef, service: () => SettingsService): FeatureSettingsAccess<T> {
  return {
    get: () => service().forFeature<T>(feature),
    set: ({ path, value }) => service().setForFeature(feature, path, value),
    reset: () => {
      // Validate registration before removing a stored slice.
      service().forFeature(feature);
      service().removeStored(['features', feature]);
    },
  };
}
