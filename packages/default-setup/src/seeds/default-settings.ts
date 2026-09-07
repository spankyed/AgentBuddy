import type { SettingsData } from '@/plugins/settings/be/types'

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
      visibility: {}
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
