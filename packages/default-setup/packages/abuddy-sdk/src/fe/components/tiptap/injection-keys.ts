import type { InjectionKey } from 'vue'
import type { Editor } from '@tiptap/vue-3'

export interface BlockItem {
  label: string
  icon: any
  command: (e: Editor) => void
}

export const EXTRA_BLOCK_ITEMS_KEY: InjectionKey<BlockItem[]> = Symbol('extraBlockItems')
