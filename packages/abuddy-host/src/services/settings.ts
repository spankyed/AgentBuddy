// services.settings: the app's settings as pack code reaches them, over the host's one settings store.
//
// The store is the app's (`features/settings/be/store.ts`) — one row, one writer, the defaults merged under the
// user's changes. This is the pack-facing face of it: a feature reads and writes its own settings, and each
// registered section, without depending on whichever pack renders the settings view.
import type { SettingsService } from '@abuddy/sdk/services';
import type { SettingsStore } from '../features/settings/be/store.ts';

/**
 * The service over `store`. A name that arrives as a string is parsed by the store once
 * (`featureRef`), which throws naming the ref it likely meant, so every write below takes a ref the
 * caller's name resolved to rather than whatever it wrote.
 */
export function createSettingsService(store: SettingsStore): SettingsService {
  return {
    getAll: <T,>() => store.getAll() as T,
    getStored: <T,>() => store.getStored() as T,
    getSection: (section) => store.getSection(section),
    forFeature: (name) => store.getFeatureSettings(store.featureRef(name)),
    setForFeature: (name, path, value) => store.setFeatureSetting(store.featureRef(name), path, value),
    setInSection: (section, path, value) => store.setSectionValue(section, path, value),
    replaceAll: (settings) => store.replaceAll(settings),
    removeStored: (path) => store.removeStored(path),
    reset: () => store.reset(),
    whileReplacingData: (replace) => store.whileReplacingData(replace),
    onChange: (listener) => store.onChange(listener),
  };
}
