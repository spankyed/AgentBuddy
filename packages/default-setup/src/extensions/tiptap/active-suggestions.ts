import type { EditorState } from '@tiptap/pm/state';
import { commandSuggestionPluginKey } from './command-suggestion-plugin.ts';
import { referenceSuggestionPluginKey } from './reference-plugin-key.ts';

export function isSuggestionActive(state: EditorState): boolean {
  return commandSuggestionPluginKey.getState(state)?.active === true
    || referenceSuggestionPluginKey.getState(state)?.active === true;
}
