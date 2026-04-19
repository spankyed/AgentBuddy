import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.3',
  description: 'Add default terminal scripts to code settings',
  up: () => {
    const data = settingsQueries.getSettings();
    const codeSettings = data.plugins?.code;

    if (codeSettings && codeSettings.terminalScripts === undefined) {
      settingsCommands.updateSettings('plugin', 'code', ['terminalScripts'], [
        { id: 'ts_default_0', label: 'Start', command: 'npm start' },
        { id: 'ts_default_1', label: 'Dev', command: 'npm run dev' },
        { id: 'ts_default_2', label: 'Build', command: 'npm run build' },
        { id: 'ts_default_3', label: 'Test', command: 'npm test' },
      ]);
    }
  }
};
