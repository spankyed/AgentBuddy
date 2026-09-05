import { repository } from '@/repository';
import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
  target: '0.3.14',
  description: 'Rename code setting lastDirectoryOpened → baseDirectory; move openLinksInApp to browser plugin',
  up: () => {
    const data = repository.settingsQueries.getSettings();
    const code = (data.plugins as any)?.code ?? {};

    // Copy the old key to the new key if it exists and the new key isn't already set
    if (code.lastDirectoryOpened && !code.baseDirectory) {
      repository.settingsCommands.updateSettings('plugin', 'code', ['baseDirectory'], code.lastDirectoryOpened);
    }

    // Move openLinksInApp from general.application to plugins.browser
    const openLinksInApp = (data.general as any)?.application?.openLinksInApp;
    if (openLinksInApp !== undefined && !(data.plugins as any)?.browser?.openLinksInApp) {
      repository.settingsCommands.updateSettings('plugin', 'browser', ['openLinksInApp'], openLinksInApp);
    }
  },
};
