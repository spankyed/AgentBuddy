import { tx, qx } from '@/__generated__/ears';

import { EARS } from '@/__generated__/ears';

import { changesFrom, removeIn, setIn, SETTINGS_KIND, settingsProblems, SettingsRefusedError } from '../../document';
import type { GeneralSettings, SettingsData } from '../types';
import { getDefaultSettings } from '../defaults';
import { deepMerge } from '@abuddy/sdk/utils/pure';
import { refProblem, resolveRegistered, type FeatureRef, type RefLookup } from '@abuddy/sdk/ids';
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

/** How a plugin's name is looked up: among the installed features with settings, a disabled pack's included */
const settingsLookup = (): RefLookup => ({ registered: getFeaturesWithSettings(), among: 'installed' });

// Initialize default settings (called on startup)
export const createDefaultSettings = (): void => {
  getSettingsEntity(); // Ensure entity exists
};

/** The general settings in effect, or one section of them by its label (the defaults are merged in already) */
function getGeneralSettings(): GeneralSettings;
function getGeneralSettings<K extends keyof GeneralSettings>(label: K): GeneralSettings[K];
function getGeneralSettings(label?: keyof GeneralSettings): GeneralSettings | GeneralSettings[keyof GeneralSettings] {
  const general = getSettingsEntity().data.general;
  return label ? general[label] : general;
}

// QUERIES
export const settingsQueries = {
  getSettings: (): SettingsData => getSettingsEntity().data,

  /**
   * Only what the user changed, without the defaults merged in — what a migration has to rewrite, since
   * writing a merged copy back would freeze today's defaults into the user's stored settings.
   */
  getStoredSettings: (): Partial<SettingsData> => getStoredSettings(),

  getGeneralSettings,

  getAssistantSettings: () => getSettingsEntity().data.assistant,

  /** A plugin's settings in effect, by its ref */
  getPluginSettings: (plugin: FeatureRef) => getSettingsEntity().data.plugins[plugin] ?? {},

  /**
   * The ref of the installed feature with settings `name` stands for: where a plugin's name arrives as a string (a
   * client's send, an action's `services.settings` call), it is parsed here once, and throws naming the ref it likely
   * meant. What the store's commands and queries take is a `FeatureRef`.
   */
  pluginSettingsRef: (name: string): FeatureRef => resolveRegistered(SETTINGS_KIND, name, settingsLookup()),
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
  if (replacingData === 0) for (const listener of writeListeners) listener();
}

/** How many data replacements are running (`whileReplacingData`): while any is, writes tell no listener */
let replacingData = 0;

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
    const lookup = settingsLookup();
    const problems = settingsProblems(settings, {
      before: getSettingsEntity().data,
      keyProblem: (key) => refProblem(SETTINGS_KIND, key, lookup),
    });
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

  /**
   * Runs `replace`, which replaces the stored data wholesale (a backup import), telling the listeners of no write made
   * until it settles: the settings arrive past this writer, and the migrations the import runs write through it, so a
   * diff against what features were told before would have them rewrite rows that came in with it. Held here, at the
   * writer, it holds whenever those writes happen. The caller tells every feature its settings once it settles
   * (`DATA_REPLACED`), done or failed, since a failed import may have migrated some of the data already.
   */
  async whileReplacingData<T>(replace: () => Promise<T>): Promise<T> {
    replacingData++;
    try {
      return await replace();
    } finally {
      replacingData--;
    }
  },
};
