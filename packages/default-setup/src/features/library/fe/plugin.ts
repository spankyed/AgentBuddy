import { Library } from 'lucide-vue-next'
import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe'
import { librarySystem } from './state'
import LibraryCanvas from './canvas.vue'
import LibraryPanel from './panel.vue'
import settings from './settings.vue'
import { id } from './state'

import type { LibraryEvents } from './state'
/** Where an editor link into the library lands */
export const accepts = pluginAccepts<Extract<LibraryEvents, { type: 'EDIT_DOCUMENT' | 'NAVIGATE_TO_FOLDER' }>>();

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