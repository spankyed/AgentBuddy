import type { SettingsData } from './types';

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
      }
    }
  },
  internal: {
    hasOnboarded: false,
    lastInteractionTimestamp: null,
    version: '1.0.0'
  }
};