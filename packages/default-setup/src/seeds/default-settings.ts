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
        switchPluginUp: { key: 'ArrowUp', modifiers: ['cmd', 'option'] },
        switchPluginDown: { key: 'ArrowDown', modifiers: ['cmd', 'option'] },
        toggleInspectionPanel: { key: 'b', modifiers: ['cmd'] }
      },
      openLinksInApp: true
    },
    projects: []
  },
  plugins: {
    _meta: {
      visibility: {
        threads: true,
        code: true,
        library: false,
        flows: false,
        actions: false,
        prompts: false,
        brain: false,
        database: false,
        logs: false,
        browser: false,
        notes: false,
        settings: true,
      }
    },
  },
  internal: {
    hasOnboarded: false,
    lastInteractionTimestamp: null,
    version: '',
    seedHash: null,
  },
  assistant: {
    name: '',
    birthdate: null
  }
}

export default settings
