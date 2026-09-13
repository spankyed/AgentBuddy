// Tiptap editor extension points: packs contribute plugins through PackFERegistration and
// provide extra block items. Pack FE code gets the host's copy through @abuddy/sdk/fe.
import type { InjectionKey, Component } from 'vue'
import type { AnyExtension, Editor } from '@tiptap/vue-3'
import type { EditorState } from '@tiptap/pm/state'

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
export const TIPTAP_PLUGINS_KEY: InjectionKey<TiptapPlugin[]> = Symbol('tiptapPlugins')

const plugins: TiptapPlugin[] = [];
/** The pack each registered plugin came from */
const pluginPacks = new WeakMap<TiptapPlugin, string | undefined>();

export const tiptapPluginRegistry = {
  register(plugin: TiptapPlugin, packId?: string): void {
    pluginPacks.set(plugin, packId);
    plugins.push(plugin);
  },
  unregisterAll(packId: string): void {
    for (let i = plugins.length - 1; i >= 0; i--) {
      if (pluginPacks.get(plugins[i]) === packId) {
        plugins.splice(i, 1);
      }
    }
  },
  getAll(): TiptapPlugin[] {
    return plugins;
  },
};
