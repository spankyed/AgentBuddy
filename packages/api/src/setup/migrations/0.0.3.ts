import { settingsQueries, settingsCommands } from '@/systems/settings/repository';

export const migration = {
  target: '0.0.3',
  description: 'Migrate agent plugin settings to threads.chat',
  up: () => {
    const data = settingsQueries.getSettings();
    const agentSettings = data.plugins?.agent;
    const existingChatSettings = (data.plugins as any)?.threads?.chat;

    if (agentSettings && !existingChatSettings) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat'], agentSettings);
    }

    // If lastActivePlugin was 'agent', update to 'threads'
    if (data.plugins?._meta?.lastActivePlugin === 'agent') {
      settingsCommands.updateSettings('plugin', '_meta', ['lastActivePlugin'], 'threads');
    }
  },
};
