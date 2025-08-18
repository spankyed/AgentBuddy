import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { SettingsEntity, SettingsData, PluginSettings, defaultSettings } from '../types';

/**
 * Settings Repository - Manages user settings and configuration
 */

// Helper to get settings entity by label
function getSettingsByLabel(label: string): SettingsEntity | undefined {
  const allSettings = qx(EARS.Entity.Settings).pickAll() as unknown as SettingsEntity[];
  return allSettings.find(s => s.label === label);
}

// Get or create general settings entity
function getOrCreateGeneralSettings(): SettingsEntity {
  let settings = getSettingsByLabel('general');
  
  if (settings) {
    return settings;
  }
  
  // Create default general settings
  const newSettings: SettingsEntity = {
    id: `${EARS.Entity.Settings}-general` as EARS.EntityId,
    entityType: EARS.Entity.Settings,
    type: 'general',
    label: 'general',
    createdAt: Date.now(),
    data: defaultSettings.general
  };
  
  tx(newSettings as any);
  return newSettings;
}

// Get or create plugin settings entity
function getOrCreatePluginSettings(pluginId: string): SettingsEntity {
  let settings = getSettingsByLabel(pluginId);
  
  if (settings) {
    return settings;
  }
  
  // Create default plugin settings
  const newSettings: SettingsEntity = {
    id: `${EARS.Entity.Settings}-plugin-${pluginId}` as EARS.EntityId,
    entityType: EARS.Entity.Settings,
    type: 'plugin',
    label: pluginId,
    createdAt: Date.now(),
    data: {}
  };
  
  tx(newSettings as any);
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
    const settings = getSettingsByLabel(label);
    return settings || null;
  }
};

// COMMANDS
export const settingsCommands = {
  /**
   * Update general settings
   */
  updateGeneralSettings(generalSettings: Partial<SettingsData['general']>): SettingsEntity {
    const settings = getOrCreateGeneralSettings();
    
    // Merge with existing general settings
    const updatedSettings: SettingsEntity = {
      ...settings,
      data: {
        ...settings.data,
        ...generalSettings,
        personal: {
          ...settings.data.personal,
          ...(generalSettings.personal || {})
        },
        apiKeys: {
          ...settings.data.apiKeys,
          ...(generalSettings.apiKeys || {})
        },
        hotkeys: {
          ...settings.data.hotkeys,
          ...(generalSettings.hotkeys || {})
        },
        misc: {
          ...settings.data.misc,
          ...(generalSettings.misc || {})
        }
      }
    };
    
    tx(updatedSettings as any);
    return updatedSettings;
  },

  /**
   * Update plugin settings for a specific plugin
   */
  updatePluginSettings(pluginId: string, pluginSettings: any): SettingsEntity {
    const settings = getOrCreatePluginSettings(pluginId);
    
    const updatedSettings: SettingsEntity = {
      ...settings,
      data: pluginSettings
    };
    
    tx(updatedSettings as any);
    return updatedSettings;
  },

  /**
   * Update personal information
   */
  updatePersonalInfo(personalInfo: Partial<SettingsData['general']['personal']>): SettingsEntity {
    const settings = getOrCreateGeneralSettings();
    
    const updatedSettings: SettingsEntity = {
      ...settings,
      data: {
        ...settings.data,
        personal: {
          ...settings.data.personal,
          ...personalInfo
        }
      }
    };
    
    tx(updatedSettings as any);
    return updatedSettings;
  },

  /**
   * Update API keys
   */
  updateApiKeys(apiKeys: Partial<SettingsData['general']['apiKeys']>): SettingsEntity {
    const settings = getOrCreateGeneralSettings();
    
    const updatedSettings: SettingsEntity = {
      ...settings,
      data: {
        ...settings.data,
        apiKeys: {
          ...settings.data.apiKeys,
          ...apiKeys
        }
      }
    };
    
    tx(updatedSettings as any);
    return updatedSettings;
  },

  /**
   * Update hotkeys
   */
  updateHotkeys(hotkeys: Partial<SettingsData['general']['hotkeys']>): SettingsEntity {
    const settings = getOrCreateGeneralSettings();
    
    const updatedSettings: SettingsEntity = {
      ...settings,
      data: {
        ...settings.data,
        hotkeys: {
          ...settings.data.hotkeys,
          ...hotkeys
        }
      }
    };
    
    tx(updatedSettings as any);
    return updatedSettings;
  },

  /**
   * Update custom hotkeys
   */
  updateCustomHotkeys(customHotkeys: any[]): SettingsEntity {
    const settings = getOrCreateGeneralSettings();
    
    const updatedSettings: SettingsEntity = {
      ...settings,
      data: {
        ...settings.data,
        hotkeys: {
          ...settings.data.hotkeys,
          custom: customHotkeys
        }
      }
    };
    
    tx(updatedSettings as any);
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
    const generalSettings: SettingsEntity = {
      id: `${EARS.Entity.Settings}-general` as EARS.EntityId,
      entityType: EARS.Entity.Settings,
      type: 'general',
      label: 'general',
      createdAt: Date.now(),
      data: defaultSettings.general
    };
    
    tx(generalSettings as any);
  }
};