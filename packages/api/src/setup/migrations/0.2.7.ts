import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.7',
  description: 'Change default recentThreadsSortOrder from created to visited',
  up: () => {
    const data = settingsQueries.getSettings();
    const threads = data.plugins?.threads;
    if (threads?.recentThreadsSortOrder === 'created') {
      settingsCommands.updateSettings('plugin', 'threads', ['recentThreadsSortOrder'], 'visited');
    }
  }
};
