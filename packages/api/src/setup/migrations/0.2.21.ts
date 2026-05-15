import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.21',
  description: 'Add hermes agent mode to thread settings',
  up: () => {
    const data = settingsQueries.getSettings();
    const modes: Array<{ id: string; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    if (modes.some(m => m.id === 'hermes')) return;

    // Insert after 'work', before hidden 'manager'
    const workIdx = modes.findIndex(m => m.id === 'work');
    const insertAt = workIdx !== -1 ? workIdx + 1 : modes.length;
    modes.splice(insertAt, 0, {
      id: 'hermes',
      name: 'Hermes',
      description: 'Hermes autonomous agent mode',
    });

    settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
  },
};
