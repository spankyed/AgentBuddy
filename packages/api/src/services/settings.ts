/**
 * Settings Service
 * 
 * Provides convenient access to application settings with type-safe methods
 * for common operations on general, plugin, and internal settings.
 */

import { repository } from '@/repository';
import type { SettingsData } from '@/systems/settings/types';

export class SettingsService {
  /**
   * Get all settings including general, plugins, and internal
   */
  getAll(): SettingsData {
    return repository.settingsQueries.getSettings();
  }

  /**
   * Get settings for a specific plugin
   * @param pluginId - The plugin identifier
   */
  getPluginSettings<T = any>(pluginId: string): T {
    return repository.settingsQueries.getPluginSettings(pluginId) as T;
  }

  /**
   * Get all general settings
   */
  getGeneralSettings(): SettingsData['general'] {
    return repository.settingsQueries.getGeneralSettings();
  }

  /**
   * Get internal system settings
   */
  getInternalSettings(): SettingsData['internal'] {
    return repository.settingsQueries.getInternalSettings();
  }

  /**
   * Update a plugin setting
   * @param pluginId - The plugin identifier
   * @param path - Path to the setting property (e.g., ['hotkeys', 'openTerminal'])
   * @param value - The new value
   */
  updatePluginSetting(pluginId: string, path: string[], value: any): void {
    repository.settingsCommands.updateSettings('plugin', pluginId, path, value);
  }

  /**
   * Update a general setting
   * @param category - The general settings category (e.g., 'hotkeys', 'secrets')
   * @param path - Path to the setting property
   * @param value - The new value
   */
  updateGeneralSetting(category: string, path: string[], value: any): void {
    repository.settingsCommands.updateSettings('general', category, path, value);
  }

  /**
   * Update an internal setting
   * @param path - Path to the setting property
   * @param value - The new value
   */
  updateInternalSetting(path: string[], value: any): void {
    repository.settingsCommands.updateSettings('internal', 'internal', path, value);
  }

  /**
   * Reset all settings to their defaults
   */
  resetToDefaults(): void {
    repository.settingsCommands.resetSettings();
  }

  /**
   * Check if a specific plugin has settings
   * @param pluginId - The plugin identifier
   */
  hasPluginSettings(pluginId: string): boolean {
    const settings = this.getAll();
    return pluginId in settings.plugins;
  }

  /**
   * Get a specific setting value by path
   * @param type - The setting type ('general', 'plugin', 'internal')
   * @param label - The setting label/category
   * @param path - Path to the specific value
   */
  getSettingValue(type: 'general' | 'plugin' | 'internal', label: string, path: string[]): any {
    const settings = type === 'general' 
      ? this.getGeneralSettings()[label as keyof SettingsData['general']]
      : type === 'plugin'
      ? this.getPluginSettings(label)
      : this.getInternalSettings();
    
    return path.reduce((obj, key) => obj?.[key], settings);
  }
}

export const settingsService = new SettingsService();