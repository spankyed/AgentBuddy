import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { SettingsEntity, SettingsData } from '../types';
import { defaultSettings } from '../defaults';

// Deep merge: defaults fill missing keys, stored values win. Arrays are not merged.
function deepMerge(defaults: any, stored: any): any {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return stored ?? defaults;
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return stored;
  const result = { ...defaults };
  for (const key of Object.keys(stored)) {
    result[key] = deepMerge(defaults[key], stored[key]);
  }
  return result;
}

// Use a fixed ID without hyphen to avoid LMDB persistence issues
// The ID "Settings-app" has a bug where updates don't persist
const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

// Get or create the single settings entity
const getSettingsEntity = (): { id: EARS.EntityId; data: SettingsData } => {
  // Always query first
  const existing = qx(SETTINGS_ID).pickOne(['data']) as { data?: any };

  // If doesn't exist at all, create it
  if (!existing) {
    tx(SETTINGS_ID, true) // treatAsNew=true to add createdAt timestamp
      .put('entityType', EARS.Entity.Settings)
      .put('data', defaultSettings);

    return { id: SETTINGS_ID, data: defaultSettings };
  }

  // Merge defaults with stored data so new default fields backfill automatically
  return {
    id: SETTINGS_ID,
    data: deepMerge(defaultSettings, existing.data)
  };
};

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

  getGeneralSettings: (label?: string) => {
    const general = getSettingsEntity().data.general;
    if (label) {
      return (general as any)[label] || (defaultSettings.general as any)[label] || {};
    }
    return general;
  },

  getInternalSettings: () => getSettingsEntity().data.internal,

  getAssistantSettings: () => getSettingsEntity().data.assistant,

  getPluginSettings: (pluginId: string) => {
    const data = getSettingsEntity().data;
    return data.plugins?.[pluginId] || (defaultSettings.plugins as any)[pluginId] || {};
  },
};

// COMMANDS
export const settingsCommands = {
  updateSettings(type: string, label: string | null, path: string[], value: any): void {
    const entity = getSettingsEntity();

    // General & plugin settings are grouped by label (e.g., general.secrets, plugin.flows)
    // Internal & assistant settings don't use labels
    const needsLabel = type === 'general' || type === 'plugin';
    if (needsLabel && !label) {
      throw new Error(`Setting type '${type}' requires a label`);
    }

    // Build path matching the data structure (note: 'plugin' type maps to 'plugins' in data)
    const dataKey = type === 'plugin' ? 'plugins' : type;
    const fullPath = needsLabel
      ? [dataKey, label!, ...path]
      : [dataKey, ...path];

    const newData = setNestedValue(entity.data, fullPath, value);

    tx(entity.id)
      .put('data', newData)
      .put('updatedAt', Date.now());
  },

  replaceSettings(data: SettingsData): void {
    const entity = getSettingsEntity();
    tx(entity.id)
      .put('data', data)
      .put('updatedAt', Date.now());
  },

  resetSettings: () => {
    const entity = getSettingsEntity();
    tx(entity.id).put('data', defaultSettings);
  }
};

// Re-export change detection utilities
export { detectAllArrayChanges, detectChanges, detectStatusChanges, detectCategoryChanges } from '../change-detection';
export type { DiffResult } from '../change-detection';
