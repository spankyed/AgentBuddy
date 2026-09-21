/**
 * Settings Service
 *
 * Provides convenient access to application settings with type-safe methods
 * for common operations on general and plugin settings.
 */

import { repository } from '@/__generated__/repository';
import type { SettingsData } from '@/features/settings/be/types';
import { pluginSettingsKey } from '@/features/settings/plugin-settings';

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
   * @param plugin - The plugin, named as this pack names it: its own feature by id, another pack's `<packId>/<featureId>`
   * @param path - Path to the setting property (e.g., ['hotkeys', 'openTerminal'])
   * @param value - The new value
   */
  updatePluginSetting(plugin: string, path: string[], value: any): void {
    repository.settingsCommands.updateSettings('plugin', pluginSettingsKey(plugin), path, value);
  }
}

export const settingsService = new SettingsService();