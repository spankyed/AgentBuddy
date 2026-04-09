import type { SETTINGS_SCOPE, SettingsData } from './types';
import { APP_VERSION } from '@/version';

export const getDefaultsByLabel = (type: SETTINGS_SCOPE, label: string) =>
({
  internal: defaultSettings.internal,
  general: defaultSettings.general[label as keyof typeof defaultSettings.general] ?? {},
  plugin: defaultSettings.plugins[label as keyof typeof defaultSettings.plugins] ?? {},
}[type]);

export const defaultSettings: SettingsData = {
  general: {
    personal: {},
    secrets: {
      google: null,
      anthropic: null,
      openai: null,
      groq: null,
      mistral: null,
      cohere: null,
      custom: {},
      required: ['openai', 'anthropic'],
      cliPaths: {
        'copilot': '',
        'claude-code': '',
        'codex': '',
        'gh': '',
      },
    },
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
    misc: {},
    projects: []
  },
  plugins: {
    _meta: {
      visibility: {
        // Only threads visible for guided tour
        threads: true,
        code: false,
        library: false,
        flows: false,
        actions: false,
        prompts: false,
        brain: false,
        database: false,
        logs: false,
        settings: true, // Settings should always be visible
        blank: false,
      }
    },
    code: {
      hotkeys: {
        openTerminal: { key: '`', modifiers: ['ctrl'] },
        navigatePrevPanel: { key: '[', modifiers: ['cmd', 'shift'] },
        navigateNextPanel: { key: ']', modifiers: ['cmd', 'shift'] },
        focusSearch: { key: 'f', modifiers: ['cmd', 'shift'] },
        quickOpen: { key: 'p', modifiers: ['cmd'] },
      },
      restoreTerminals: true,
      defaultBaseDirectory: null,
      lastDirectoryOpened: null,
      enableShellIntegration: false,
      confirmTerminalClose: true,
      closeTerminalOnTabClose: true,
      mdEditorDefault: true,
      autoFetchRemote: false,
      autoFetchIntervalSeconds: 180,
    },
    database: {
      hotkeys: {
        executeQuery: { key: 'Enter', modifiers: ['cmd'] }
      }
    },
    threads: {
      chat: {
        modes: [
          { id: 'birth', name: 'Birth', description: 'Assistant onboarding and setup mode', hidden: true },
          { id: 'chat', name: 'Chat', description: 'General conversation mode' },
          {
            id: 'work',
            name: 'Work',
            description: 'Implementation and coding mode',
            phases: [
              { id: 'plan', name: 'Plan', description: 'Strategic planning and task breakdown' },
              { id: 'edit', name: 'Edit', description: 'Implementation and development' },
              { id: 'review', name: 'Review', description: 'Code review and refinement' }
            ]
          },
          { id: 'note', name: 'Note', description: 'Note-taking and documentation mode' }
        ],
        hotkeys: {
          textToSpeech: { key: ' ', modifiers: ['ctrl'], global: true },
          switchMode: { key: 'Tab', modifiers: ['shift'], global: true },
          quickPrompts: { key: 'p', modifiers: ['cmd', 'shift'], global: true }
        },
        quickPrompts: [
          { id: 'qp_1', text: 'Write a commit message' },
          { id: 'qp_2', text: 'Review the code' },
          { id: 'qp_3', text: 'Summarize the conversation to a md file' },
          { id: 'qp_4', text: 'What are the next steps?' },
        ]
      },
      statuses: [
        { label: 'Backlog', color: '#6B7280' },
        { label: 'Open', color: '#3B82F6' },
        { label: 'In Progress', color: '#F59E0B' },
        { label: 'In Review', color: '#A855F7' },
        { label: 'Done', color: '#10B981' }
      ],
      tags: [
        { name: 'High Priority', color: '#F59E0B' },
        { name: 'Low Priority', color: '#6B7280' },
        { name: 'Bug', color: '#EF4444' },
        { name: 'Feature', color: '#10B981' },
        { name: 'Enhancement', color: '#3B82F6' },
        { name: 'Documentation', color: '#6366F1' },
      ],
      showOnlyRootThreads: false,
      clickToChat: false
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
    },
    library: {
      tags: [
        { name: 'Reference', color: '#3B82F6' },
        { name: 'Tutorial', color: '#10B981' },
        { name: 'Template', color: '#A855F7' },
        { name: 'Research', color: '#F59E0B' },
        { name: 'Archive', color: '#6B7280' },
        { name: 'Important', color: '#EF4444' },
      ]
    },
    flows: {
      rootFlowId: undefined, // Will be set to first available flow or selected by user
      enableFlowPreview: true // Enable flow preview on single click
    },
    brain: {
      runningRootFlowId: undefined, // No flow running initially
      inspectEnabled: false, // Inspection panel disabled by default
    },
    notes: {
      tasklistPanelPosition: 'left'
    },
    logs: {
      maxLogs: 1000, // Default to 1000 logs
      excludedSources: [] // No sources excluded by default
    }
  },
  internal: {
    hasOnboarded: false,
    tourComplete: false,
    lastInteractionTimestamp: null,
    version: APP_VERSION,
    seedHash: null,
  },
  assistant: {
    name: '',
    birthdate: null
  }
};