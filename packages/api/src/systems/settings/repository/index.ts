import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { SettingsEntity, SettingsData, PluginSettings, defaultSettings } from '../types';

/**
 * Settings Repository - Manages user settings and configuration
 */

// Helper to deep set a value at a path in an object
function setValueAtPath(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;
  
  const [head, ...tail] = path;
  const result = { ...obj };
  
  if (tail.length === 0) {
    result[head] = value;
  } else {
    result[head] = setValueAtPath(obj[head] || {}, tail, value);
  }
  
  return result;
}

// Helper to get settings entity by label
function findSettingsByLabel(label: string): SettingsEntity | undefined {
  const allSettings = qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
  return allSettings.find(s => s.label === label);
}

// Get or create general settings entity
function getOrCreateGeneralSettings(): SettingsEntity {
  let settings = findSettingsByLabel('general');
  
  if (settings) {
    return settings;
  }
  
  // Create default general settings
  const createdAt = Date.now();
  const id = tx(EARS.Entity.Settings)
    .batchPut({
      entityType: EARS.Entity.Settings,
      type: 'general',
      label: 'general',
      createdAt,
      data: defaultSettings.general
    })
    .id();
  
  const newSettings: SettingsEntity = {
    id,
    entityType: EARS.Entity.Settings,
    type: 'general',
    label: 'general',
    createdAt,
    data: defaultSettings.general
  };
  
  return newSettings;
}

// Get or create plugin settings entity
function getOrCreatePluginSettings(pluginId: string): SettingsEntity {
  let settings = findSettingsByLabel(pluginId);
  
  if (settings) {
    return settings;
  }
  
  // Create default plugin settings
  const createdAt = Date.now();
  const id = tx(EARS.Entity.Settings)
    .batchPut({
      entityType: EARS.Entity.Settings,
      type: 'plugin',
      label: pluginId,
      createdAt,
      data: {}
    })
    .id();
  
  const newSettings: SettingsEntity = {
    id,
    entityType: EARS.Entity.Settings,
    type: 'plugin',
    label: pluginId,
    createdAt,
    data: {}
  };
  
  return newSettings;
}

// QUERIES
export const settingsQueries = {
  /**
   * Get all settings entities
   */
  getAllSettings(): SettingsEntity[] {
    const allSettings = qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
    return allSettings;
  },

  /**
   * Get all settings data in combined format
   */
  getSettings(): SettingsData {
    const generalSettings = getOrCreateGeneralSettings();
    const allSettings = qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
    const pluginSettings = allSettings.filter(s => s.type === 'plugin');
    
    const plugins: PluginSettings = {};
    pluginSettings.forEach(ps => {
      plugins[ps.label] = ps.data;
    });
    
    const settingsData: SettingsData = {
      general: generalSettings.data,
      plugins
    };
    
    return settingsData;
  },

  /**
   * Get general settings
   */
  getGeneralSettings(): SettingsData['general'] {
    const settings = getOrCreateGeneralSettings();
    return settings.data;
  },

  /**
   * Get plugin settings for a specific plugin
   */
  getPluginSettings(pluginId: string): any {
    const settings = getOrCreatePluginSettings(pluginId);
    return settings.data;
  },

  /**
   * Get settings entity by label
   */
  getSettingsByLabel(label: string): SettingsEntity | null {
    const settings = findSettingsByLabel(label);
    return settings || null;
  }
};

// Development setup
export function setupDevelopmentSettings(): void {
  // Only in development mode
  if (process.env.NODE_ENV === 'production') return;
  
  // Check if settings already exist
  const existingSettings = qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
  if (existingSettings.length > 0) return; // Settings already exist, don't override
  
  // Create default general settings with test hotkeys
  const createdAt = Date.now();
  tx(EARS.Entity.Settings)
    .batchPut({
      entityType: EARS.Entity.Settings,
      type: 'general',
      label: 'general',
      createdAt,
      data: {
        ...defaultSettings.general,
        hotkeys: {
          switchPluginUp: {
            key: 'ArrowUp',
            modifiers: ['cmd', 'option']
          },
          switchPluginDown: {
            key: 'ArrowDown',
            modifiers: ['cmd', 'option']
          },
          toggleInspectionPanel: {
            key: 'b',
            modifiers: ['cmd']
          },
          custom: [
            {
              id: 'dev-hotkey-1',
              eventName: 'TEST_EVENT_1',
              key: 't',
              modifiers: ['cmd', 'shift']
            }
          ]
        }
      }
    });
  
  console.log('[Settings] Development settings initialized with test hotkeys');
}

// COMMANDS
export const settingsCommands = {
  /**
   * Universal update method for any settings entity
   * @param type - 'general' or 'plugin'
   * @param label - Entity label (e.g., 'general' or plugin ID)
   * @param path - Path to the value to update (e.g., ['personal', 'name'])
   * @param value - The value to set
   */
  updateSettings(type: 'general' | 'plugin', label: string, path: string[], value: any): SettingsEntity {
    const settings = type === 'general' 
      ? getOrCreateGeneralSettings()
      : getOrCreatePluginSettings(label);
    
    const updatedData = path.length === 0 
      ? value 
      : setValueAtPath(settings.data, path, value);
    
    // Update the entity's data attribute
    tx(settings.id).updateBatch({
      data: updatedData,
      updatedAt: Date.now()
    });
    
    const updatedSettings: SettingsEntity = {
      ...settings,
      data: updatedData
    };
    
    return updatedSettings;
  },

  /**
   * Reset settings to defaults
   */
  resetSettings(): void {
    // Delete all existing settings entities
    const allSettings = qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
    allSettings.forEach(s => tx(s.id).destroy());
    
    // Create default general settings
    const createdAt = Date.now();
    tx(EARS.Entity.Settings)
      .batchPut({
        entityType: EARS.Entity.Settings,
        type: 'general',
        label: 'general',
        createdAt,
        data: defaultSettings.general
      });
  }
};