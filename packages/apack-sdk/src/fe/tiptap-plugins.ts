// Tiptap editor extension points: packs contribute plugins through PackFERegistration and
// provide extra block items. Pack FE code gets the host's copy through @apackdev/sdk/fe.
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
  readonly extensions?: Readonly<Record<string, AnyExtension>>
  readonly popups?: Readonly<Record<string, Component>>
  readonly isSuggestionActive?: (state: EditorState) => boolean
}

/** One accepted editor group; declarations and unavailable groups belong to the catalog. */
export interface TiptapPluginBinding {
  readonly packId: string
  readonly groupId: string
  readonly binding: TiptapPlugin
}

export const EXTRA_BLOCK_ITEMS_KEY: InjectionKey<BlockItem[]> = Symbol('extraBlockItems')

// The tiptap plugins the renderer's registered pack frontends contribute
export const tiptapPluginRegistry = {
  getAll(): TiptapPluginBinding[] {
    return boundFeHost().packs.tiptapPlugins();
  },
  /** Observe committed frontend changes; reread bindings and compare their identities. */
  onChanged(listener: () => void): () => void {
    return boundFeHost().packs.onChanged(listener);
  },
};
