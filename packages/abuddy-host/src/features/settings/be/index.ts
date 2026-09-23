// The app's settings: the one row, its one writer, and the pack-facing service over it. The system and the plugin
// that render them are beside this; what a program composing the app needs is here.
export { createSettingsStore, SETTINGS_ENTITY, type SettingsChange, type SettingsDocument, type SettingsStore, type SettingsStoreOptions } from './store.ts';
export {
  changesFrom, isEqual, PLUGINS_SECTION, removeIn, SETTINGS_KIND, SettingsRefusedError, settingsProblems, setIn,
  type SettingsCheck,
} from './document.ts';
export { createSettingsService } from '../../../services/settings.ts';
