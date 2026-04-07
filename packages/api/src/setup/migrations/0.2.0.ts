import { settingsQueries, settingsCommands } from '@/systems/settings/repository';

export const migration = {
  version: '0.2.0',
  description: 'Migrate agent plugin settings to threads.chat',
  up: () => {
    const data = settingsQueries.getSettings();
    const agentSettings = data.plugins?.agent;
    const existingChatSettings = (data.plugins as any)?.threads?.chat;

    if (agentSettings && !existingChatSettings) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat'], agentSettings);
    }
  },
};
