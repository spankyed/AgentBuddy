import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.3.0',
  description: 'Add codex agent mode if missing; remove Hermes settings',
  up: () => {
    const data = settingsQueries.getSettings();
    const modes: Array<{ id: string; name?: string; description?: string; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    const codexPhases = [
      { id: 'plan', name: 'Plan', description: 'Strategic planning and exploration', color: '#3B82F6' },
      { id: 'default', name: 'Default', description: 'Implementation and development', color: '#6B7280' },
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

    const nextModes = modes.filter(mode => mode.id !== 'hermes');
    settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], nextModes);

    const plugins = (data.plugins as any) ?? {};
    const visibility = plugins._meta?.visibility;
    if (visibility && Object.prototype.hasOwnProperty.call(visibility, 'hermes')) {
      const nextVisibility = { ...visibility };
      delete nextVisibility.hermes;
      settingsCommands.updateSettings('plugin', '_meta', ['visibility'], nextVisibility);
    }

    if (Object.prototype.hasOwnProperty.call(plugins, 'hermes')) {
      const nextPlugins = { ...plugins };
      delete nextPlugins.hermes;
      settingsCommands.updateSettings('plugins', null, [], nextPlugins);
    }
  },
};
