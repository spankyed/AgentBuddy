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
   * @param plugin - The ref of an installed feature with settings, `<packId>/<featureId>` (`'default-setup/threads'`):
   * whoever calls, a bare name would be read as this pack's, so it throws, naming the ref it likely meant
   */
  getPluginSettings<T = any>(plugin: `${string}/${string}`): T {
    return repository.settingsQueries.getPluginSettings(repository.settingsQueries.pluginSettingsRef(plugin)) as T;
  }

  /**
   * Get all general settings
   */
  getGeneralSettings(): SettingsData['general'] {
    return repository.settingsQueries.getGeneralSettings();
  }

  /**
   * Update a plugin setting
   * @param plugin - The ref of an installed feature with settings, `<packId>/<featureId>`; anything else throws
   * @param path - Path to the setting property (e.g., ['hotkeys', 'openTerminal'])
   * @param value - The new value
   */
  updatePluginSetting(plugin: `${string}/${string}`, path: string[], value: any): void {
    repository.settingsCommands.updatePluginSetting(repository.settingsQueries.pluginSettingsRef(plugin), path, value);
  }
}

export const settingsService = new SettingsService();