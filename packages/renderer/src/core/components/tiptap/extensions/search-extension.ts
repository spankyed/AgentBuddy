import { Extension } from '@tiptap/core'
import { searchPlugin } from './search-plugin'

export { searchPluginKey } from './search-plugin'

export const SearchAndFind = Extension.create({
  name: 'searchAndFind',

  addProseMirrorPlugins() {
    return [searchPlugin()]
  },
})
