import type { SettingsData } from '../defs/action-defs'

const settings: SettingsData = {
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
    application: {
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
      }
    },
    projects: []
  },
  plugins: {
    _meta: {
      visibility: {
        threads: true,
        code: false,
        library: false,
        flows: false,
        actions: false,
        prompts: false,
        brain: false,
        database: false,
        logs: false,
        settings: true,
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
        saveFile: { key: 's', modifiers: ['cmd'] },
        closeTab: { key: 'w', modifiers: ['cmd'] },
      },
      restoreTerminals: true,
      defaultBaseDirectory: null,
      lastDirectoryOpened: null,
      enableShellIntegration: false,
      confirmTerminalClose: true,
      closeTerminalOnTabClose: true,
      maxTerminals: 25,
      mdEditorDefault: true,
      enablePreview: true,
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
          {
            id: 'work',
            name: 'Work',
            description: 'Implementation and coding mode',
            phases: [
              { id: 'plan', name: 'Plan', description: 'Strategic planning and task breakdown', color: '#3B82F6' },
              { id: 'edit', name: 'Edit', description: 'Implementation and development', color: '#6B7280' },
            ]
          },
          { id: 'manager', name: 'Manager', description: 'Delegate tasks and coordinate agents' },
        ],
        hotkeys: {
          textToSpeech: { key: 'r', modifiers: ['cmd'], global: true },
          quickPrompts: { key: 'd', modifiers: ['cmd'], global: true }
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
        { name: 'claude-session', color: '#7C3AED' },
      ],
      chatStates: [
        { id: 'idle',    label: 'Idle',    color: '#6B7280', busy: false },
        { id: 'working', label: 'Working', color: '#FACC15', busy: true },
        { id: 'paused',  label: 'Paused',  color: '#F59E0B', busy: false },
        { id: 'error',   label: 'Error',   color: '#EF4444', busy: false },
        { id: 'success', label: 'Success', color: '#10B981', busy: false },
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
      rootFlowId: undefined,
      enableFlowPreview: true
    },
    brain: {
      runningRootFlowId: undefined,
      inspectEnabled: false,
    },
    notes: {
      tasklistPanelPosition: 'left'
    },
    logs: {
      maxLogs: 1000,
      excludedSources: [],
      showAppEvents: false
    }
  },
  internal: {
    hasOnboarded: false,
    tourComplete: false,
    lastInteractionTimestamp: null,
    // version is overridden with APP_VERSION at load time in packages/api/src/systems/settings/defaults.ts
    version: '',
    seedHash: null,
  },
  assistant: {
    name: '',
    birthdate: null
  }
}

export default settings
