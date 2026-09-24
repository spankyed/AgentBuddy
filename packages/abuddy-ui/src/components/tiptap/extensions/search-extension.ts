import { Extension } from '@tiptap/core'
import { searchPlugin } from './search-plugin.ts'

export { searchPluginKey } from './search-plugin.ts'

export const SearchAndFind = Extension.create({
  name: 'searchAndFind',

  addProseMirrorPlugins() {
    return [searchPlugin()]
  },
})
