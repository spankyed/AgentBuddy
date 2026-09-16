/**
 * Settings Service
 * 
 * Provides convenient access to application settings with type-safe methods
 * for common operations on general, plugin, and internal settings.
 */

import { repository } from '@/__generated__/repository';
import type { SettingsData } from '@/features/settings/be/types';

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
   * Update an internal setting
   * @param path - Path to the setting property
   * @param value - The new value
   */
  updateInternalSetting(path: string[], value: any): void {
    repository.settingsCommands.updateSettings('internal', null, path, value);
  }
}

export const settingsService = new SettingsService();