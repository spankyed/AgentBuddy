import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { SettingsEntity, SettingsData } from '../types';
import { defaultSettings } from '../defaults';

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

  // Return existing data (might be undefined if entity exists but has no data)
  return {
    id: SETTINGS_ID,
    data: existing.data || defaultSettings
  };
};

// Helper to update nested values
const setNestedValue = (obj: any, path: string[], value: any): any => {
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

  getGeneralSettings: () => getSettingsEntity().data.general,

  getInternalSettings: () => getSettingsEntity().data.internal,

  getPluginSettings: (pluginId: string) => {
    const data = getSettingsEntity().data;
    return data.plugins?.[pluginId] || (defaultSettings.plugins as any)[pluginId] || {};
  },
};

// COMMANDS
export const settingsCommands = {
  updateSettings(type: string, label: string | null, path: string[], value: any): SettingsEntity {
    const entity = getSettingsEntity();

    // For internal settings, label is not needed
    const fullPath = type === 'internal'
      ? ['internal', ...path]
      : type === 'general'
      ? ['general', label!, ...path]
      : ['plugins', label!, ...path];

    const newData = setNestedValue(entity.data, fullPath, value);

    tx(entity.id)
      .put('data', newData)
      .put('updatedAt', Date.now());

    return {
      id: entity.id,
      entityType: EARS.Entity.Settings,
      name: type === 'internal' ? 'internal' : `${type}.${label}`,
      data: type === 'internal'
        ? newData.internal
        : type === 'general'
        ? newData.general[label!]
        : newData.plugins[label!],
      createdAt: Date.now()
    } as SettingsEntity;
  },

  resetSettings: () => {
    const entity = getSettingsEntity();
    tx(entity.id).put('data', defaultSettings);
  }
};

// Re-export change detection utilities
export { detectAllArrayChanges, detectChanges, detectStatusChanges, detectCategoryChanges } from '../change-detection';
export type { DiffResult } from '../change-detection';