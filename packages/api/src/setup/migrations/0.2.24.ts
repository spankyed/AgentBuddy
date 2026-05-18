import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.24',
  description: 'Add codex agent mode if missing',
  up: () => {
    const data = settingsQueries.getSettings();
    const modes: Array<{ id: string; name?: string; description?: string; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    if (modes.some(m => m.id === 'codex')) return;

    // Insert after hermes, before manager (or at end if hermes not found)
    const hermesIdx = modes.findIndex(m => m.id === 'hermes');
    const insertAt = hermesIdx !== -1 ? hermesIdx + 1 : modes.length;
    modes.splice(insertAt, 0, {
      id: 'codex',
      name: 'Codex',
      description: 'OpenAI Codex agent mode',
    });

    settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
  },
};
