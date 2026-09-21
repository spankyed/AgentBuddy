import { tx, qx } from '@/__generated__/ears';

import { EARS } from '@/__generated__/ears';

import { pluginId } from '@/__generated__/events';
import type { SettingsData } from '../types';
import { getDefaultSettings } from '../defaults';
import { mergeSettings } from '../../merge-settings';

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
  data: mergeSettings(getDefaultSettings(), getStoredSettings()),
});

/**
 * The key a plugin's settings are stored under: the id the plugin runs under (`<packId>.<featureId>`),
 * which is what the renderer reads them by. This pack's backend code names its own features by id, so
 * those are resolved through the generated name map — the same one `emit` and `sendToPlugin` use.
 *
 * Anything the map doesn't name is already a key: an id the frontend sent, or `_meta`, which is the
 * plugins map's own metadata and not a plugin at all.
 */
const settingsKeyFor = (label: string): string => (pluginId as Record<string, string>)[label] ?? label;

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

  getPluginSettings: (plugin: string) => {
    const key = settingsKeyFor(plugin);
    const data = getSettingsEntity().data;
    return data.plugins?.[key] || (getDefaultSettings().plugins as any)[key] || {};
  },
};

// COMMANDS
export const settingsCommands = {
  updateSettings(type: string, label: string | null, path: string[], value: any): void {
    const stored = getStoredSettings();

    // General & plugin settings are grouped by label (e.g., general.application, plugin.flows)
    // Assistant settings don't use labels
    const needsLabel = type === 'general' || type === 'plugin';
    if (needsLabel && !label) {
      throw new Error(`Setting type '${type}' requires a label`);
    }

    // Build path matching the data structure (note: 'plugin' type maps to 'plugins' in data)
    const dataKey = type === 'plugin' ? 'plugins' : type;
    const key = type === 'plugin' && label ? settingsKeyFor(label) : label;
    const fullPath = needsLabel
      ? [dataKey, key!, ...path]
      : [dataKey, ...path];

    const newData = setNestedValue(stored, fullPath, value);

    tx(SETTINGS_ID)
      .put('data', newData)
      .put('updatedAt', Date.now());
  },

  replaceSettings(data: SettingsData): void {
    const entity = getSettingsEntity();
    tx(entity.id)
      .put('data', data)
      .put('updatedAt', Date.now());
  },

  /** Removes a stored value (its path in the stored data), so its default applies again */
  removeStored(path: string[]): void {
    const newData = structuredClone(getStoredSettings());
    const parent = path.slice(0, -1).reduce<any>((node, key) => node?.[key], newData);
    const key = path[path.length - 1];
    if (!parent || typeof parent !== 'object' || !(key in parent)) return;
    delete parent[key];
    tx(SETTINGS_ID)
      .put('data', newData)
      .put('updatedAt', Date.now());
  },

  resetSettings: () => {
    getStoredSettings();
    tx(SETTINGS_ID).put('data', {});
  }
};


