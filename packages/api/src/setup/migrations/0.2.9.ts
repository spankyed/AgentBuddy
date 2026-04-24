import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.9',
  description: 'Hide manager mode from mode selector',
  up: () => {
    const data = settingsQueries.getSettings();
    const modes: Array<{ id: string; hidden?: boolean; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    const manager = modes.find(m => m.id === 'manager');
    if (manager && !manager.hidden) {
      manager.hidden = true;
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
    }
  },
};
