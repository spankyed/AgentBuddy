import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { 
  successResult,
  errorResult,
  RepositoryError,
  RepositoryErrorCode,
  type RepositoryResult
} from '@/core/utils/repository';
import { SettingsEntity, SettingsData, defaultSettings } from '../types';

/**
 * Settings Repository - Manages user settings and configuration
 */

// Get or create settings entity
function getOrCreateSettings(): SettingsEntity {
  const existingSettings = (qx(EARS.Entity.Settings as any).first() as unknown) as SettingsEntity | undefined;
  
  if (existingSettings) {
    return existingSettings;
  }
  
  // Create default settings if none exist
  const newSettings: SettingsEntity = {
    id: `${EARS.Entity.Settings}-default` as EARS.EntityId,
    entityType: EARS.Entity.Settings,
    createdAt: Date.now(),
    data: defaultSettings
  };
  
  tx(newSettings as any);
  return newSettings;
}

// QUERIES
export const settingsQueries = {
  /**
   * Get all settings
   */
  getSettings(): RepositoryResult<SettingsEntity> {
    try {
      const settings = getOrCreateSettings();
      return successResult(settings);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to get settings',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Get general settings
   */
  getGeneralSettings(): RepositoryResult<SettingsData['general']> {
    try {
      const settings = getOrCreateSettings();
      return successResult(settings.data.general);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to get general settings',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Get plugin settings for a specific plugin
   */
  getPluginSettings(pluginId: string): RepositoryResult<any> {
    try {
      const settings = getOrCreateSettings();
      return successResult(settings.data.plugins[pluginId] || {});
    } catch (error) {
      return errorResult(
        new RepositoryError(
          `Failed to get settings for plugin ${pluginId}`,
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Get FAQ items
   */
  getFAQItems(): RepositoryResult<SettingsData['faq']['items']> {
    try {
      const settings = getOrCreateSettings();
      return successResult(settings.data.faq.items);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to get FAQ items',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  }
};

// COMMANDS
export const settingsCommands = {
  /**
   * Update general settings
   */
  updateGeneralSettings(generalSettings: Partial<SettingsData['general']>): RepositoryResult<SettingsEntity> {
    try {
      const settings = getOrCreateSettings();
      
      // Merge with existing general settings
      const updatedSettings: SettingsEntity = {
        ...settings,
        data: {
          ...settings.data,
          general: {
            ...settings.data.general,
            ...generalSettings,
            personal: {
              ...settings.data.general.personal,
              ...(generalSettings.personal || {})
            },
            apiKeys: {
              ...settings.data.general.apiKeys,
              ...(generalSettings.apiKeys || {})
            },
            hotkeys: {
              ...settings.data.general.hotkeys,
              ...(generalSettings.hotkeys || {})
            },
            misc: {
              ...settings.data.general.misc,
              ...(generalSettings.misc || {})
            }
          }
        }
      };
      
      tx(updatedSettings as any);
      return successResult(updatedSettings);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to update general settings',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Update plugin settings for a specific plugin
   */
  updatePluginSettings(pluginId: string, pluginSettings: any): RepositoryResult<SettingsEntity> {
    try {
      const settings = getOrCreateSettings();
      
      const updatedSettings: SettingsEntity = {
        ...settings,
        data: {
          ...settings.data,
          plugins: {
            ...settings.data.plugins,
            [pluginId]: pluginSettings
          }
        }
      };
      
      tx(updatedSettings as any);
      return successResult(updatedSettings);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          `Failed to update settings for plugin ${pluginId}`,
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Update personal information
   */
  updatePersonalInfo(personalInfo: Partial<SettingsData['general']['personal']>): RepositoryResult<SettingsEntity> {
    try {
      const settings = getOrCreateSettings();
      
      const updatedSettings: SettingsEntity = {
        ...settings,
        data: {
          ...settings.data,
          general: {
            ...settings.data.general,
            personal: {
              ...settings.data.general.personal,
              ...personalInfo
            }
          }
        }
      };
      
      tx(updatedSettings as any);
      return successResult(updatedSettings);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to update personal information',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Update API keys
   */
  updateApiKeys(apiKeys: Partial<SettingsData['general']['apiKeys']>): RepositoryResult<SettingsEntity> {
    try {
      const settings = getOrCreateSettings();
      
      const updatedSettings: SettingsEntity = {
        ...settings,
        data: {
          ...settings.data,
          general: {
            ...settings.data.general,
            apiKeys: {
              ...settings.data.general.apiKeys,
              ...apiKeys
            }
          }
        }
      };
      
      tx(updatedSettings as any);
      return successResult(updatedSettings);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to update API keys',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Update hotkeys
   */
  updateHotkeys(hotkeys: Partial<SettingsData['general']['hotkeys']>): RepositoryResult<SettingsEntity> {
    try {
      const settings = getOrCreateSettings();
      
      const updatedSettings: SettingsEntity = {
        ...settings,
        data: {
          ...settings.data,
          general: {
            ...settings.data.general,
            hotkeys: {
              ...settings.data.general.hotkeys,
              ...hotkeys
            }
          }
        }
      };
      
      tx(updatedSettings as any);
      return successResult(updatedSettings);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to update hotkeys',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  },

  /**
   * Reset settings to defaults
   */
  resetSettings(): RepositoryResult<SettingsEntity> {
    try {
      const settings: SettingsEntity = {
        id: `${EARS.Entity.Settings}-default` as EARS.EntityId,
        entityType: EARS.Entity.Settings,
        createdAt: Date.now(),
        data: defaultSettings
      };
      
      tx(settings as any);
      return successResult(settings);
    } catch (error) {
      return errorResult(
        new RepositoryError(
          'Failed to reset settings',
          RepositoryErrorCode.OPERATION_FAILED,
          error
        )
      );
    }
  }
};