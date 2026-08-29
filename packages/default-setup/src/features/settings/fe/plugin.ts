import type { Plugin } from '@/core/types'
import { Settings } from 'lucide-vue-next'
import state, { id } from './state'
import canvas from './canvas/index.vue'

export const settingsPlugin: Plugin = {
  id,
  label: 'Settings',
  icon: Settings,
  state,
  canvas,
  isPinned: true
}

export default settingsPlugin;