import type { InjectionKey, Component } from 'vue'
import type { AnyExtension, Editor } from '@tiptap/vue-3'
import type { EditorState } from '@tiptap/pm/state'

export interface BlockItem {
  label: string
  icon: any
  command: (e: Editor) => void
}

export interface TiptapPlugin {
  extensions?: AnyExtension[]
  popups?: Component[]
  isSuggestionActive?: (state: EditorState) => boolean
}

export const EXTRA_BLOCK_ITEMS_KEY: InjectionKey<BlockItem[]> = Symbol('extraBlockItems')
export const TIPTAP_PLUGINS_KEY: InjectionKey<TiptapPlugin[]> = Symbol('tiptapPlugins')
