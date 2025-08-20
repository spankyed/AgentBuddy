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
    },
    database: {
      hotkeys: {
        executeQuery: { key: 'Enter', modifiers: ['cmd'] }
      }
    },
    prompts: {
      categories: [
        { name: 'General', color: '#6B7280' },
        { name: 'Creative', color: '#A855F7' },
        { name: 'Technical', color: '#3B82F6' },
        { name: 'Analysis', color: '#10B981' },
        { name: 'Communication', color: '#F59E0B' },
      ]
    },
    actions: {
      categories: [
        { name: 'Utility', color: '#6B7280' },
        { name: 'Data Processing', color: '#3B82F6' },
        { name: 'Integration', color: '#10B981' },
        { name: 'Automation', color: '#F59E0B' },
        { name: 'Validation', color: '#EF4444' },
      ]
    }
  },
  internal: {
    hasOnboarded: false,
    lastInteractionTimestamp: null,
    version: '1.0.0'
  }
};