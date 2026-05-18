import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.3.0',
  description: 'Add codex agent mode if missing',
  up: () => {
    const data = settingsQueries.getSettings();
    const modes: Array<{ id: string; name?: string; description?: string; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    const codexPhases = [
      { id: 'plan', name: 'Plan', description: 'Strategic planning and exploration', color: '#3B82F6' },
      { id: 'default', name: 'Code', description: 'Implementation and development', color: '#6B7280' },
    ];

    if (!modes.some(m => m.id === 'codex')) {
      // Insert after hermes, before manager (or at end if hermes not found)
      const hermesIdx = modes.findIndex(m => m.id === 'hermes');
      const insertAt = hermesIdx !== -1 ? hermesIdx + 1 : modes.length;
      modes.splice(insertAt, 0, {
        id: 'codex',
        name: 'Codex',
        description: 'OpenAI Codex agent mode',
        phases: codexPhases,
      });
    } else {
      // Patch existing codex mode with phases if missing
      const codexMode = modes.find(m => m.id === 'codex');
      if (codexMode && !codexMode.phases) {
        codexMode.phases = codexPhases;
      }
    }

    settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
  },
};
