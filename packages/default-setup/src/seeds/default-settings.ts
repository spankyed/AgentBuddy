import type { SettingsData } from '@/features/settings/be/types'

const settings: SettingsData = {
  general: {
    personal: {},
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
  assistant: {
    name: '',
    birthdate: null
  }
}

export default settings
