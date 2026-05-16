import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.20',
  description: 'Add showStashes, showCommits, showWorktrees defaults to code plugin',
  up: () => {
    const data = settingsQueries.getSettings();
    const code = data.plugins?.code as Record<string, unknown> | undefined;

    if (code?.showStashes === undefined) {
      settingsCommands.updateSettings('plugin', 'code', ['showStashes'], true);
    }
    if (code?.showCommits === undefined) {
      settingsCommands.updateSettings('plugin', 'code', ['showCommits'], true);
    }
    if (code?.showWorktrees === undefined) {
      settingsCommands.updateSettings('plugin', 'code', ['showWorktrees'], false);
    }
  }
};
