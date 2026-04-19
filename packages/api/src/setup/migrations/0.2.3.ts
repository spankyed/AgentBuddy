import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.3',
  description: 'Add default terminal scripts to code settings, enable clickToChat and quickPromptNumberKeyInserts for threads',
  up: () => {
    const data = settingsQueries.getSettings();

    // 1. Add default terminal scripts to code settings
    const codeSettings = data.plugins?.code;
    if (codeSettings && codeSettings.terminalScripts === undefined) {
      settingsCommands.updateSettings('plugin', 'code', ['terminalScripts'], [
        { id: 'ts_default_0', label: 'Start', command: 'npm start' },
        { id: 'ts_default_1', label: 'Dev', command: 'npm run dev' },
        { id: 'ts_default_2', label: 'Build', command: 'npm run build' },
        { id: 'ts_default_3', label: 'Test', command: 'npm test' },
      ]);
    }

    // 2. Enable clickToChat for threads (default changed from false to true)
    const threadsSettings = data.plugins?.threads;
    if (threadsSettings?.chat?.clickToChat === false) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'clickToChat'], true);
    }

    // 3. Enable quickPromptNumberKeyInserts for existing users (new default is true)
    if (threadsSettings?.chat && threadsSettings.chat.quickPromptNumberKeyInserts === undefined) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'quickPromptNumberKeyInserts'], true);
    }
  }
};
