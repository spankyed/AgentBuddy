import type { Plugin } from "@abuddy/sdk/fe"
import config from '../feature.config'
import { Settings } from 'lucide-vue-next'
import state, { id } from './state'
import canvas from './canvas/index.vue'

export const settingsPlugin: Plugin = {
  id,
  label: 'Settings',
  designation: config.designation,
  icon: Settings,
  state,
  canvas,
  isPinned: true,

}

export default settingsPlugin;