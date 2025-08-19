import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { SettingsEntity, SettingsData } from '../types';
import { defaultSettings, getDefaultsByLabel } from '../defaults';

// Core helpers
const getAllSettings = () => qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
const findSettings = (type: 'general' | 'plugin' | 'internal', label: string) => 
  getAllSettings().find(s => s.type === type && s.label === label);

const setValueAtPath = (obj: any, path: string[], value: any): any => 
  path.length === 0 ? value : { ...obj, [path[0]]: setValueAtPath(obj[path[0]] || {}, path.slice(1), value) };

const getOrCreateSettings = (type: 'general' | 'plugin' | 'internal', label: string, customDefaults?: any): SettingsEntity => {
  const existing = findSettings(type, label);
  if (existing) return existing;
  
  // Use custom defaults if provided, otherwise fetch from default settings
  const defaultData = customDefaults !== undefined ? customDefaults : getDefaultsByLabel(type, label);
  
  const createdAt = Date.now();
  const id = tx(EARS.Entity.Settings).batchPut({
    entityType: EARS.Entity.Settings, type, label, createdAt, data: defaultData
  }).id();
  
  return { id, entityType: EARS.Entity.Settings, type, label, createdAt, data: defaultData };
};

// General settings config
const generalConfig = {
  personal: 'personal',
  apikeys: 'apiKeys',
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

// Development setup
// ! not used currently
export const setupDevelopmentSettings = (): void => {
  if (process.env.NODE_ENV === 'production' || getAllSettings().length > 0) return;
  
  const testHotkeys = {
    ...defaultSettings.general.hotkeys,
    custom: [{ id: 'dev-hotkey-1', eventName: 'TEST_EVENT_1', key: 't', modifiers: ['cmd', 'shift'] }]
  };
  
  getOrCreateSettings('general', 'hotkeys', testHotkeys);
  ['personal', 'apikeys', 'misc'].forEach(label => 
    getOrCreateSettings('general', generalConfig[label as keyof typeof generalConfig])
  );
  
  console.log('[Settings] Development settings initialized with test hotkeys');
};