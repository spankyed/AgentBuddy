import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.3.14',
  description: 'Rename code setting lastDirectoryOpened → baseDirectory',
  up: () => {
    const data = settingsQueries.getSettings();
    const code = (data.plugins as any)?.code ?? {};

    // Copy the old key to the new key if it exists and the new key isn't already set
    if (code.lastDirectoryOpened && !code.baseDirectory) {
      settingsCommands.updateSettings('plugin', 'code', ['baseDirectory'], code.lastDirectoryOpened);
    }
  },
};
