import { repository } from '@abuddy/sdk/ears';
import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
  target: '0.2.7',
  description: 'Change default recentThreadsSortOrder from created to visited',
  up: () => {
    const data = repository.settingsQueries.getSettings();
    const threads = data.plugins?.threads;
    if (threads?.recentThreadsSortOrder === 'created') {
      repository.settingsCommands.updateSettings('plugin', 'threads', ['recentThreadsSortOrder'], 'visited');
    }
  }
};
