import { repository } from '@/repository';
const { settingsQueries, settingsCommands } = repository;
import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
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
