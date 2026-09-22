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
   * A plugin's settings in effect
   * @param plugin - The plugin's ref, `<packId>/<featureId>` (`'default-setup/threads'`): whoever calls, a bare
   * name would be read as this pack's, so it throws
   */
  getPluginSettings<T = any>(plugin: `${string}/${string}`): T {
    return repository.settingsQueries.getPluginSettings(plugin) as T;
  }

  /**
   * Get all general settings
   */
  getGeneralSettings(): SettingsData['general'] {
    return repository.settingsQueries.getGeneralSettings();
  }

  /**
   * Update a plugin setting
   * @param plugin - The plugin's ref, `<packId>/<featureId>`; a bare name throws
   * @param path - Path to the setting property (e.g., ['hotkeys', 'openTerminal'])
   * @param value - The new value
   */
  updatePluginSetting(plugin: `${string}/${string}`, path: string[], value: any): void {
    repository.settingsCommands.updateSettings('plugin', plugin, path, value);
  }
}

export const settingsService = new SettingsService();