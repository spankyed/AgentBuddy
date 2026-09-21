import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';
import { pluginSettingsKey } from '@/features/settings/plugin-settings';

export const migration: PackMigration = {
  target: '0.3.14',
  description: 'Rename code setting lastDirectoryOpened → baseDirectory; move openLinksInApp to browser plugin',
  up: () => {
    // What the user stored, under the plugin's ref or, before 0.3.15 moved it, its feature id: a merged read would
    // take a default for the user's choice and write it into their stored settings
    const stored = repository.settingsQueries.getStoredSettings();
    const plugins = (stored.plugins ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const storedSlice = (feature: string) => {
      const key = [pluginSettingsKey(feature), feature].find((candidate) => plugins[candidate] !== undefined);
      return { key, slice: key ? plugins[key]! : {} };
    };

    const code = storedSlice('code');
    if (code.key && code.slice.lastDirectoryOpened !== undefined) {
      if (code.slice.baseDirectory === undefined) {
        repository.settingsCommands.updateSettings('plugin', pluginSettingsKey('code'), ['baseDirectory'], code.slice.lastDirectoryOpened);
      }
      repository.settingsCommands.removeStored(['plugins', code.key, 'lastDirectoryOpened']);
    }

    const openLinksInApp = (stored.general?.application as Record<string, unknown> | undefined)?.openLinksInApp;
    if (openLinksInApp !== undefined) {
      if (storedSlice('browser').slice.openLinksInApp === undefined) {
        repository.settingsCommands.updateSettings('plugin', pluginSettingsKey('browser'), ['openLinksInApp'], openLinksInApp);
      }
      repository.settingsCommands.removeStored(['general', 'application', 'openLinksInApp']);
    }
  },
};
