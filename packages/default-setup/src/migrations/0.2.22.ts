import { repository } from '@abuddy/sdk/ears';
import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
  target: '0.2.22',
  description: 'Rename work mode to claude-code; add hermes mode if missing',
  up: () => {
    const data = repository.settingsQueries.getSettings();
    const modes: Array<{ id: string; name?: string; description?: string; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    // Rename work → claude-code
    const workMode = modes.find(m => m.id === 'work');
    if (workMode) {
      workMode.id = 'claude-code';
      workMode.name = 'Claude Code';
      workMode.description = 'Claude Code agent mode';
    }

    // Add hermes mode if missing
    if (!modes.some(m => m.id === 'hermes')) {
      const ccIdx = modes.findIndex(m => m.id === 'claude-code');
      const insertAt = ccIdx !== -1 ? ccIdx + 1 : modes.length;
      modes.splice(insertAt, 0, {
        id: 'hermes',
        name: 'Hermes',
        description: 'Hermes autonomous agent mode',
      });
    }

    repository.settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);

    // Update defaultMode if it was 'work'
    const defaultMode = (data.plugins as any)?.threads?.chat?.defaultMode;
    if (defaultMode === 'work') {
      repository.settingsCommands.updateSettings('plugin', 'threads', ['chat', 'defaultMode'], 'claude-code');
    }
  },
};
