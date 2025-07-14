import { Library } from 'lucide-vue-next'
import type { Plugin } from '@/core/types/index.ts'
import { librarySystem } from './state'
import LibraryCanvas from './canvas.vue'
import LibraryPanel from './panel.vue'

const library: Plugin = {
  id: 'library',
  label: 'Library',
  icon: Library,
  state: librarySystem,
  canvas: LibraryCanvas,
  panel: LibraryPanel,
}

export default library