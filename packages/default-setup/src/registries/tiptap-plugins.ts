import type { TiptapPlugin } from '@abuddy/sdk/fe/components/tiptap/injection-keys'
import { commandSuggestionPluginKey } from '../shared/tiptap/command-suggestion-plugin'
import { referenceSuggestionPluginKey } from '../shared/tiptap/reference-plugin-key'
import { CommandViewerDecoration } from '../shared/tiptap/command-viewer-decoration'
import { ReferenceNode } from '../shared/tiptap/reference-node'
import { CommandSuggestion } from '../shared/tiptap/command-extension'
import ReferenceSuggestionPopup from '../shared/tiptap/ReferenceSuggestionPopup.vue'
import CommandSuggestionPopup from '../shared/tiptap/CommandSuggestionPopup.vue'

export const tiptapPlugins: TiptapPlugin[] = [
  {
    extensions: [ReferenceNode, CommandSuggestion, CommandViewerDecoration],
    popups: [ReferenceSuggestionPopup, CommandSuggestionPopup],
    isSuggestionActive: (state) =>
      commandSuggestionPluginKey.getState(state)?.active === true
      || referenceSuggestionPluginKey.getState(state)?.active === true,
  },
]
