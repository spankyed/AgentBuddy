import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { SettingsEntity, SettingsData } from '../types';
import { defaultSettings, getDefaultsByLabel } from '../defaults';

// Deterministic ID generation for Settings entities
const getSettingsId = (type: 'general' | 'plugin' | 'internal', label: string): EARS.EntityId => {
  // Generate a deterministic ID based on type and label
  // This ensures only one Settings entity can exist per type/label combination
  return `Settings-${type}-${label}` as EARS.EntityId;
};

// Core helpers
const getAllSettings = () => qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
const findSettings = (type: 'general' | 'plugin' | 'internal', label: string) => {
  // First try to get by deterministic ID (fast path)
  const deterministicId = getSettingsId(type, label);
  const directResult = qx(deterministicId).pickAll()[0] as unknown as SettingsEntity | undefined;
  if (directResult && directResult.type === type && directResult.label === label) {
    return directResult;
  }
  
  // Fallback to searching all settings (for migrating old data)
  return getAllSettings().find(s => s.type === type && s.label === label);
};

const setValueAtPath = (obj: any, path: string[], value: any): any => 
  path.length === 0 ? value : { ...obj, [path[0]]: setValueAtPath(obj[path[0]] || {}, path.slice(1), value) };

const getOrCreateSettings = (type: 'general' | 'plugin' | 'internal', label: string, customDefaults?: any): SettingsEntity => {
  const existing = findSettings(type, label);
  if (existing) return existing;
  
  // Use deterministic ID
  const id = getSettingsId(type, label);
  
  // Check if entity exists with this ID (shouldn't happen, but be safe)
  const existingById = qx(id).pickAll()[0];
  if (existingById) {
    return existingById as unknown as SettingsEntity;
  }
  
  // Use custom defaults if provided, otherwise fetch from default settings
  const defaultData = customDefaults !== undefined ? customDefaults : getDefaultsByLabel(type, label);
  
  const createdAt = Date.now();
  
  // Use tx with the deterministic ID and forceCreate=true to create with specific ID
  tx(id, true).batchPut({
    entityType: EARS.Entity.Settings, type, label, createdAt, data: defaultData
  });
  
  return { id, entityType: EARS.Entity.Settings, type, label, createdAt, data: defaultData };
};

// General settings config
const generalConfig = {
  personal: 'personal',
  secrets: 'secrets',
  hotkeys: 'hotkeys',
  misc: 'misc'
} as const;

const getGeneralSettings = (label: keyof typeof generalConfig) => 
  getOrCreateSettings('general', generalConfig[label]);

const getInternalSettings = () => 
  getOrCreateSettings('internal', 'internal');

// QUERIES
export const settingsQueries = {
  getAllSettings,
  
  getSettings: (): SettingsData => ({
    general: Object.fromEntries(
      Object.keys(generalConfig).map(label => [
        generalConfig[label as keyof typeof generalConfig],
        getGeneralSettings(label as keyof typeof generalConfig).data
      ])
    ) as SettingsData['general'],
    plugins: Object.fromEntries(
      getAllSettings().filter(s => s.type === 'plugin').map(s => [s.label, s.data])
    ),
    internal: getInternalSettings().data
  }),
  
  getGeneralSettings: () => Object.fromEntries(
    Object.keys(generalConfig).map(label => [
      generalConfig[label as keyof typeof generalConfig],
      getGeneralSettings(label as keyof typeof generalConfig).data
    ])
  ) as SettingsData['general'],
  
  getPluginSettings: (pluginId: string) => {
    return getOrCreateSettings('plugin', pluginId).data;
  },
  getInternalSettings: () => getInternalSettings().data,
  getSettingsByLabel: (type: 'general' | 'plugin' | 'internal', label: string) => findSettings(type, label) || null
};

// COMMANDS
export const settingsCommands = {
  updateSettings(type: 'general' | 'plugin' | 'internal', label: string, path: string[], value: any): SettingsEntity {
    const settings = type === 'general' 
      ? getGeneralSettings(label as keyof typeof generalConfig)
      : type === 'internal'
      ? getInternalSettings()
      : getOrCreateSettings('plugin', label);
    
    const updatedData = path.length === 0 ? value : setValueAtPath(settings.data, path, value);
    tx(settings.id).updateBatch({ data: updatedData, updatedAt: Date.now() });
    
    return { ...settings, data: updatedData };
  },
  
  resetSettings: () => {
    getAllSettings().forEach(s => tx(s.id).destroy());
    Object.keys(generalConfig).forEach(label => 
      getGeneralSettings(label as keyof typeof generalConfig)
    );
    getInternalSettings();
  }
};

// Initialize all default settings at startup
export const createDefaultSettings = (): void => {
  if (getAllSettings().length) return;

  const put = (type: 'general' | 'plugin' | 'internal', label: string, data: unknown) => {
    if (!findSettings(type, label)) {
      const id = getSettingsId(type, label);
      // Use forceCreate=true to create with deterministic ID
      tx(id, true).batchPut({
        entityType: EARS.Entity.Settings,
        type, label, data
      });
    }
  };

  Object.values(generalConfig).forEach(label =>
    put('general', label, defaultSettings.general[label] ?? {})
  );

  Object.entries(defaultSettings.plugins).forEach(([label, data]) =>
    put('plugin', label, data ?? {})
  );

  put('internal', 'internal', defaultSettings.internal);
};

// Re-export change detection utilities
export { detectAllArrayChanges, detectChanges, detectStatusChanges, detectCategoryChanges } from '../change-detection';
export type { DiffResult } from '../change-detection';