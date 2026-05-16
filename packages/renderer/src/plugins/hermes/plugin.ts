import type { Plugin } from '@/core/types/index.ts'
import { Bot } from 'lucide-vue-next'
import state, { id } from './state.ts'
import canvas from './canvas.vue'
import settings from './settings.vue'

const hermesPlugin: Plugin = {
  id,
  label: 'Hermes',
  icon: Bot,
  state,
  canvas,
  settings,
}

export default hermesPlugin
