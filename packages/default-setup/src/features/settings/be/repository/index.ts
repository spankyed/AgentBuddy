import { tx, qx } from '@/__generated__/ears';

import { EARS } from '@/__generated__/ears';

import { changesFrom, removeIn, setIn, SETTINGS_KIND, settingsProblems, SettingsRefusedError } from '../../document';
import type { SettingsData } from '../types';
import { getDefaultSettings } from '../defaults';
import { deepMerge } from '@abuddy/sdk/utils/pure';
import { resolveRegistered, type FeatureRef } from '@abuddy/sdk/ids';
import { getFeaturesWithSettings } from '@abuddy/sdk/framework';

// Use a fixed ID without hyphen to avoid LMDB persistence issues
// The ID "Settings-app" has a bug where updates don't persist
const SETTINGS_ID = 'Settings-app' as EARS.EntityId<'Settings'>;

// The entity stores only what differs from the defaults (the user's changes), so a changed
// default, or a pack's feature settings coming and going, applies to every key the user didn't set
const getStoredSettings = (): Partial<SettingsData> => {
  const existing = qx(SETTINGS_ID).pickOne(['data']);
  if (existing) return (existing.data ?? {}) as Partial<SettingsData>;
  tx(SETTINGS_ID, true) // treatAsNew=true to add createdAt timestamp
    .put('entityType', EARS.Entity.Settings)
    .put('data', {});
  return {};
};

// The settings in effect: the defaults with the stored changes over them
const getSettingsEntity = (): { id: EARS.EntityId; data: SettingsData } => ({
  id: SETTINGS_ID,
  data: deepMerge(getDefaultSettings(), getStoredSettings()),
});

/** The refs of the installed features that declare settings, a disabled pack's included: a changed slice must be one */
const settableRefs = (): ReadonlySet<FeatureRef> => new Set(getFeaturesWithSettings());

// Initialize default settings (called on startup)
export const createDefaultSettings = (): void => {
  getSettingsEntity(); // Ensure entity exists
};

// QUERIES
export const settingsQueries = {
  getSettings: (): SettingsData => getSettingsEntity().data,

  /**
   * Only what the user changed, without the defaults merged in — what a migration has to rewrite, since
   * writing a merged copy back would freeze today's defaults into the user's stored settings.
   */
  getStoredSettings: (): Partial<SettingsData> => getStoredSettings(),

  getGeneralSettings: (label?: string) => {
    const general = getSettingsEntity().data.general;
    if (label) {
      return (general as any)[label] || (getDefaultSettings().general as any)[label] || {};
    }
    return general;
  },

  getAssistantSettings: () => getSettingsEntity().data.assistant,

  /** A plugin's settings in effect, by its ref */
  getPluginSettings: (plugin: FeatureRef) => getSettingsEntity().data.plugins[plugin] ?? {},

  /**
   * The ref of the installed feature with settings `name` stands for: where a plugin's name arrives as a string (a
   * client's send, an action's `services.settings` call), it is parsed here once, and throws naming the ref it likely
   * meant. What the store's commands and queries take is a `FeatureRef`.
   */
  pluginSettingsRef: (name: string): FeatureRef =>
    resolveRegistered(SETTINGS_KIND, name, { registered: [...settableRefs()], among: 'installed' }),
};

const writeListeners = new Set<() => void>();

/**
 * Calls `listener` after each write to the stored settings, whoever made it; returns the unsubscribe. The settings
 * system tells each feature whose settings changed from here, so a write made anywhere (a system, an action, a seed)
 * reaches the features it changed, and none is told a change twice.
 */
export function onSettingsWritten(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

/**
 * Stores `next` as the user's changes and tells the listeners, once it passes `settingsProblems` against what is
 * stored: every write goes through here, so none stores a document of the wrong shape.
 */
function write(next: unknown): void {
  const problems = settingsProblems(next, { before: getStoredSettings() });
  if (problems.length > 0) throw new SettingsRefusedError(problems);
  tx(SETTINGS_ID)
    .put('data', next as Partial<SettingsData>)
    .put('updatedAt', Date.now());
  for (const listener of writeListeners) listener();
}

/**
 * Sets `value` at `path` in a section other than the plugins': a general setting under its label
 * (`general.application`), an assistant setting under none
 */
function updateSettings(section: 'general' | 'assistant', label: string | null, path: string[], value: unknown): void {
  if (section === 'general' && !label) throw new Error("General settings are set under a label (e.g. 'application')");
  write(setIn(getStoredSettings(), section === 'general' ? [section, label!, ...path] : [section, ...path], value));
}

// COMMANDS
export const settingsCommands = {
  updateSettings,

  /** Sets `value` at `path` in a plugin's settings, by its ref */
  updatePluginSetting(plugin: FeatureRef, path: string[], value: unknown): void {
    write(setIn(getStoredSettings(), ['plugins', plugin, ...path], value));
  },

  /**
   * Makes `settings` the settings in effect: stores what they set that the defaults don't. A default they leave out
   * keeps applying, since stored settings only set values.
   */
  replaceSettings(settings: unknown): void {
    const problems = settingsProblems(settings, { before: getSettingsEntity().data, settable: settableRefs });
    if (problems.length > 0) throw new SettingsRefusedError(problems);
    write(changesFrom(getDefaultSettings(), settings) ?? {});
  },

  /** Removes a stored value (its path in the stored data), so its default applies again */
  removeStored(path: string[]): void {
    const stored = getStoredSettings();
    const next = removeIn(stored, path);
    if (next !== stored) write(next);
  },

  resetSettings: () => write({}),
};
