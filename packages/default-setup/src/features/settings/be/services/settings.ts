/**
 * Settings Service
 *
 * Provides convenient access to application settings with type-safe methods
 * for common operations on general and plugin settings.
 */

import { repository } from '@/__generated__/repository';
import type { SettingsData } from '@/features/settings/be/types';

export class SettingsService {
  /**
   * Get all settings: general, plugins and assistant
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
   * Update a plugin setting
   * @param pluginId - The plugin identifier
   * @param path - Path to the setting property (e.g., ['hotkeys', 'openTerminal'])
   * @param value - The new value
   */
  updatePluginSetting(pluginId: string, path: string[], value: any): void {
    repository.settingsCommands.updateSettings('plugin', pluginId, path, value);
  }
}

export const settingsService = new SettingsService();