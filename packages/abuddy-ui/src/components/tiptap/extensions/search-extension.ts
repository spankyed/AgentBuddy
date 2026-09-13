import { Extension } from '@tiptap/core'
import { searchPlugin } from './search-plugin.js'

export { searchPluginKey } from './search-plugin.js'

export const SearchAndFind = Extension.create({
  name: 'searchAndFind',

  addProseMirrorPlugins() {
    return [searchPlugin()]
  },
})
