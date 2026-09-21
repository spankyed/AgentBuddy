import { Library } from 'lucide-vue-next'
import type { PluginDefinition } from "@abuddy/sdk/fe"
import { librarySystem } from './state'
import LibraryCanvas from './canvas.vue'
import LibraryPanel from './panel.vue'
import settings from './settings.vue'
import { id } from './state'

const library: PluginDefinition = {
  label: 'Library',
  icon: Library,
  state: librarySystem,
  canvas: LibraryCanvas,
  panel: LibraryPanel,
  settings,
  isPinned: true,
}

export default library