import { Library } from 'lucide-vue-next'
import { definePlugin } from '@abuddy/sdk/fe'
import { librarySystem } from './state'
import LibraryCanvas from './canvas.vue'
import LibraryPanel from './panel.vue'
import settings from './settings.vue'
import { id } from './state'

const library = definePlugin({
  label: 'Library',
  icon: Library,
  state: librarySystem,
  canvas: LibraryCanvas,
  panel: LibraryPanel,
  settings,
  isPinned: true,
})

export default library