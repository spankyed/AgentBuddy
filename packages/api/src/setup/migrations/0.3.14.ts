import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.3.14',
  description: 'Rename code setting lastDirectoryOpened → baseDirectory; move openLinksInApp to browser plugin',
  up: () => {
    const data = settingsQueries.getSettings();
    const code = (data.plugins as any)?.code ?? {};

    // Copy the old key to the new key if it exists and the new key isn't already set
    if (code.lastDirectoryOpened && !code.baseDirectory) {
      settingsCommands.updateSettings('plugin', 'code', ['baseDirectory'], code.lastDirectoryOpened);
    }

    // Move openLinksInApp from general.application to plugins.browser
    const openLinksInApp = (data.general as any)?.application?.openLinksInApp;
    if (openLinksInApp !== undefined && !(data.plugins as any)?.browser?.openLinksInApp) {
      settingsCommands.updateSettings('plugin', 'browser', ['openLinksInApp'], openLinksInApp);
    }
  },
};
