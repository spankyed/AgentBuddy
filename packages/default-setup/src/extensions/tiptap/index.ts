import type { TiptapPlugin } from '@abuddy/sdk/fe'
import { commandSuggestionPluginKey } from './command-suggestion-plugin.ts'
import { referenceSuggestionPluginKey } from './reference-plugin-key.ts'
import { CommandViewerDecoration } from './command-viewer-decoration.ts'
import { ReferenceNode } from './reference-node.ts'
import { CommandSuggestion } from './command-extension.ts'
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
