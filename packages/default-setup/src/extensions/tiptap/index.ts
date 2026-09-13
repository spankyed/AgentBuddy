import type { TiptapPlugin } from '@abuddy/sdk/fe'
import { commandSuggestionPluginKey } from './command-suggestion-plugin'
import { referenceSuggestionPluginKey } from './reference-plugin-key'
import { CommandViewerDecoration } from './command-viewer-decoration'
import { ReferenceNode } from './reference-node'
import { CommandSuggestion } from './command-extension'
import ReferenceSuggestionPopup from './ReferenceSuggestionPopup.vue'
import CommandSuggestionPopup from './CommandSuggestionPopup.vue'

export const tiptapPlugins: TiptapPlugin[] = [
  {
    extensions: [ReferenceNode, CommandSuggestion, CommandViewerDecoration],
    popups: [ReferenceSuggestionPopup, CommandSuggestionPopup],
    isSuggestionActive: (state: any) =>
      commandSuggestionPluginKey.getState(state)?.active === true
      || referenceSuggestionPluginKey.getState(state)?.active === true,
  },
]
