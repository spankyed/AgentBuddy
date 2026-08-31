import type { TiptapPlugin } from '@abuddy/sdk/fe/components/tiptap/injection-keys'
import { commandSuggestionPluginKey } from './tiptap/command-suggestion-plugin'
import { referenceSuggestionPluginKey } from './tiptap/reference-plugin-key'
import { CommandViewerDecoration } from './tiptap/command-viewer-decoration'
import { ReferenceNode } from './tiptap/reference-node'
import { CommandSuggestion } from './tiptap/command-extension'
import ReferenceSuggestionPopup from './tiptap/ReferenceSuggestionPopup.vue'
import CommandSuggestionPopup from './tiptap/CommandSuggestionPopup.vue'

export const tiptapPlugins: TiptapPlugin[] = [
  {
    extensions: [ReferenceNode, CommandSuggestion, CommandViewerDecoration],
    popups: [ReferenceSuggestionPopup, CommandSuggestionPopup],
    isSuggestionActive: (state: any) =>
      commandSuggestionPluginKey.getState(state)?.active === true
      || referenceSuggestionPluginKey.getState(state)?.active === true,
  },
]
