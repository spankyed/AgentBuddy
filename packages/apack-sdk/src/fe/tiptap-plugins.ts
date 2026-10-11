// Tiptap editor extension points: packs contribute plugins through PackFERegistration and
// provide extra block items. Pack FE code gets the host's copy through @apack/sdk/fe.
import type { InjectionKey, Component } from 'vue'
import type { AnyExtension, Editor } from '@tiptap/vue-3'
import type { EditorState } from '@tiptap/pm/state'
import { boundFeHost } from '../runtime/fe-host.ts'

export interface BlockItem {
  label: string
  icon: Component
  command: (e: Editor) => void
}

export interface TiptapPlugin {
  extensions?: AnyExtension[]
  popups?: Component[]
  isSuggestionActive?: (state: EditorState) => boolean
}

export const EXTRA_BLOCK_ITEMS_KEY: InjectionKey<BlockItem[]> = Symbol('extraBlockItems')

// The tiptap plugins the renderer's registered pack frontends contribute
export const tiptapPluginRegistry = {
  getAll(): TiptapPlugin[] {
    return boundFeHost().packs.tiptapPlugins();
  },
};
