import { tx, qx } from '@/__generated__/ears';

import { EARS } from '@/__generated__/ears';

import { changesFrom, pluginKeyProblem, removeIn, setIn, settingsProblems, SettingsRefusedError } from '../../document';
import type { SettingsData } from '../types';
import { getDefaultSettings } from '../defaults';
import { deepMerge } from '@abuddy/sdk/utils/pure';
import { splitRef } from '@abuddy/sdk/ids';

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

/** The refs of the registered features that declare settings, which name the ref a bare name likely meant */
const knownRefs = (): string[] => Object.keys(getDefaultSettings().plugins);

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

  /** A plugin's settings in effect, by its ref; a bare name throws, naming the ref it likely meant */
  getPluginSettings: (plugin: string) => {
    if (!splitRef(plugin)) throw new Error(pluginKeyProblem(plugin, knownRefs()));
    return getSettingsEntity().data.plugins[plugin] ?? {};
  },
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
 * stored: every write goes through here, so none stores a document the settings refuse.
 */
function write(next: unknown): void {
  const problems = settingsProblems(next, { before: getStoredSettings(), known: knownRefs() });
  if (problems.length > 0) throw new SettingsRefusedError(problems);
  tx(SETTINGS_ID)
    .put('data', next as Partial<SettingsData>)
    .put('updatedAt', Date.now());
  for (const listener of writeListeners) listener();
}

/** The sections of the stored settings other than the plugins' slices, each keyed as the data holds it */
type SettingsSection = 'general' | 'assistant' | 'plugins';

/**
 * Sets `value` at `path` in a section: a general setting under its label (`general.application`), a plugin's under its
 * ref (`plugins['default-setup/flows']`), an assistant setting under no label
 */
function updateSettings(type: SettingsSection | 'plugin', label: string | null, path: string[], value: unknown): void {
  const needsLabel = type === 'general' || type === 'plugin';
  if (needsLabel && !label) throw new Error(`Setting type '${type}' requires a label`);
  const section = type === 'plugin' ? 'plugins' : type;
  write(setIn(getStoredSettings(), needsLabel ? [section, label!, ...path] : [section, ...path], value));
}

// COMMANDS
export const settingsCommands = {
  updateSettings,

  /**
   * Makes `settings` the settings in effect: stores what they set that the defaults don't. A default they leave out
   * keeps applying, since stored settings only set values.
   */
  replaceSettings(settings: unknown): void {
    const problems = settingsProblems(settings, { before: getSettingsEntity().data, known: knownRefs() });
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
