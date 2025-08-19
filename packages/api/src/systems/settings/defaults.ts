import type { SettingsData } from './types';

export const getDefaultsByLabel = (type: 'general' | 'plugin' | 'internal', label: string) =>
({
  internal: defaultSettings.internal,
  general: defaultSettings.general[label as keyof typeof defaultSettings.general] ?? {},
  plugin: defaultSettings.plugins[label as keyof typeof defaultSettings.plugins] ?? {},
}[type]);

export const defaultSettings: SettingsData = {
  general: {
    personal: {},
    apiKeys: {},
    hotkeys: {
      switchPluginUp: {
        key: 'ArrowUp',
        modifiers: ['cmd', 'option']
      },
      switchPluginDown: {
        key: 'ArrowDown',
        modifiers: ['cmd', 'option']
      },
      toggleInspectionPanel: {
        key: 'b',
        modifiers: ['cmd']
      }
    },
    misc: {}
  },
  plugins: {
    agent: {
      modes: [
        { id: 'plan', name: 'Plan', description: 'Strategic planning and task breakdown mode' },
        { id: 'work', name: 'Work', description: 'Implementation and coding mode' },
        { id: 'chat', name: 'Chat', description: 'General conversation mode' },
        { id: 'note', name: 'Note', description: 'Note-taking and documentation mode' }
      ],
      hotkeys: {
        textToSpeech: { key: ' ', modifiers: ['ctrl'], global: true },
        switchMode: { key: 'Tab', modifiers: ['shift'], global: true }
      }
    },
    code: {
      hotkeys: {
        openTerminal: { key: '`', modifiers: ['ctrl'] },
        navigatePrevPanel: { key: '[', modifiers: ['cmd', 'shift'] },
        navigateNextPanel: { key: ']', modifiers: ['cmd', 'shift'] }
      },
      restoreTerminals: true,
      defaultRootDirectory: null,
    }
  },
  internal: {
    hasOnboarded: false,
    lastInteractionTimestamp: null,
    version: '1.0.0'
  }
};