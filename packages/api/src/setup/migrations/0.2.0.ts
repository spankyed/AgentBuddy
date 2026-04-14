import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.0',
  description: 'Add claude-session tag, replace chat/note modes with manager mode',
  up: () => {
    const data = settingsQueries.getSettings();

    // 1. Add claude-session tag if missing
    const tags: Array<{ name: string; color: string }> = data.plugins?.threads?.tags ?? [];
    if (!tags.some(t => t.name === 'claude-session')) {
      settingsCommands.updateSettings(
        'plugin', 'threads', ['tags'],
        [...tags, { name: 'claude-session', color: '#7C3AED' }],
      );
    }

    // 2. Migrate modes: add manager, remove chat and note
    // Old default: [birth, chat, work, note]
    // New default: [birth, manager, work]
    const modes: Array<{ id: string; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    let changed = false;

    // Add manager mode before work if missing
    if (!modes.some(m => m.id === 'manager')) {
      const workIdx = modes.findIndex(m => m.id === 'work');
      const insertAt = workIdx !== -1 ? workIdx : modes.length;
      modes.splice(insertAt, 0, { id: 'manager', name: 'Manager', description: 'Delegate tasks and coordinate agents' });
      changed = true;
    }

    // Remove chat and note modes
    const removeIds = ['chat', 'note'];
    for (const id of removeIds) {
      const idx = modes.findIndex(m => m.id === id);
      if (idx !== -1) {
        modes.splice(idx, 1);
        changed = true;
      }
    }

    if (changed) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
    }
  },
};
