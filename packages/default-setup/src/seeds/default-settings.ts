import type { SettingsData } from '@/app-settings/types'

const settings: SettingsData = {
  general: {
    personal: {},
    application: {
      hotkeys: {
        switchPluginUp: { key: 'ArrowUp', modifiers: ['cmd', 'option'] },
        switchPluginDown: { key: 'ArrowDown', modifiers: ['cmd', 'option'] },
        toggleInspectionPanel: { key: 'b', modifiers: ['cmd'] }
      }
    },
    projects: []
  },
  plugins: {},
  assistant: {
    name: '',
    birthdate: null
  }
}

export default settings
