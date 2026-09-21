/**
 * Settings Service
 *
 * Provides convenient access to application settings with type-safe methods
 * for common operations on general and plugin settings.
 */

import { repository } from '@/__generated__/repository';
import type { SettingsData } from '@/features/settings/be/types';
import { checkedPluginSettingsKey, type PluginSettingsKey } from '@/features/settings/plugin-settings';

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
  getPluginSettings<T = any>(plugin: PluginSettingsKey): T {
    return repository.settingsQueries.getPluginSettings(checkedPluginSettingsKey(plugin)) as T;
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
  updatePluginSetting(plugin: PluginSettingsKey, path: string[], value: any): void {
    repository.settingsCommands.updateSettings('plugin', checkedPluginSettingsKey(plugin), path, value);
  }
}

export const settingsService = new SettingsService();