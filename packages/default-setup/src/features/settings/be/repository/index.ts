import { tx, qx } from '@/__generated__/ears';

import { EARS } from '@/__generated__/ears';

import { checkedSettingsRef } from '../../plugin-settings';
import type { SettingsData } from '../types';
import { getDefaultSettings } from '../defaults';
import { deepMerge } from '@abuddy/sdk/utils/pure';

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

// Helper to update nested values
const setNestedValue = (obj: any, path: string[], value: any): any => {
  if (path.length === 0) return value;

  const newObj = JSON.parse(JSON.stringify(obj)); // Deep clone
  let current = newObj;

  for (let i = 0; i < path.length - 1; i++) {
    current[path[i]] = current[path[i]] || {};
    current = current[path[i]];
  }

  current[path[path.length - 1]] = value;
  return newObj;
};

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

  /** A plugin's settings in effect, by its ref, which is checked here as `updateSettings` checks it: a bare name throws */
  getPluginSettings: (plugin: string) => {
    const key = checkedSettingsRef(plugin);
    const data = getSettingsEntity().data;
    return data.plugins?.[key] || (getDefaultSettings().plugins as any)[key] || {};
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

/** Stores `data` as the user's changes, and tells the listeners */
function write(data: Partial<SettingsData>): void {
  getStoredSettings();
  tx(SETTINGS_ID)
    .put('data', data)
    .put('updatedAt', Date.now());
  for (const listener of writeListeners) listener();
}

/** The sections of the stored settings other than the plugins' slices, each keyed as the data holds it */
type SettingsSection = 'general' | 'assistant' | 'plugins';

/** A plugin's settings are keyed by its ref, which is checked here: clients and actions pass it as a string */
function updateSettings(type: SettingsSection | 'plugin', label: string | null, path: string[], value: any): void {
  const stored = getStoredSettings();

  // General & plugin settings are grouped by label (e.g., general.application, plugin.flows)
  // Assistant settings don't use labels
  const needsLabel = type === 'general' || type === 'plugin';
  if (needsLabel && !label) {
    throw new Error(`Setting type '${type}' requires a label`);
  }

  // Build path matching the data structure (note: 'plugin' type maps to 'plugins' in data)
  const dataKey = type === 'plugin' ? 'plugins' : type;
  const key = type === 'plugin' ? checkedSettingsRef(label!) : label;
  const fullPath = needsLabel
    ? [dataKey, key!, ...path]
    : [dataKey, ...path];

  write(setNestedValue(stored, fullPath, value));
}

// COMMANDS
export const settingsCommands = {
  updateSettings,

  /** Stores `data` as given, once every plugin key in it is a ref: a bare key would be stored where nothing reads it */
  replaceSettings(data: SettingsData): void {
    for (const key of Object.keys(data.plugins ?? {})) checkedSettingsRef(key);
    write(data);
  },

  /** Removes a stored value (its path in the stored data), so its default applies again */
  removeStored(path: string[]): void {
    const newData = structuredClone(getStoredSettings());
    const parent = path.slice(0, -1).reduce<any>((node, key) => node?.[key], newData);
    const key = path[path.length - 1];
    if (!parent || typeof parent !== 'object' || !(key in parent)) return;
    delete parent[key];
    write(newData);
  },

  resetSettings: () => write({}),
};


