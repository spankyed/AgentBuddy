import { Library } from 'lucide-vue-next'
import { definePlugin } from '@apackdev/sdk/fe'
import { librarySystem } from './state.ts'
import LibraryCanvas from './canvas.vue'
import LibraryPanel from './panel.vue'

const library = definePlugin({
  label: 'Library',
  icon: Library,
  state: librarySystem,
  canvas: LibraryCanvas,
  panel: LibraryPanel,
  isPinned: true,
})

export default library