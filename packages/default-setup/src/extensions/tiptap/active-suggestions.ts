import type { EditorState } from '@tiptap/pm/state';
import { commandSuggestionKey } from './command-suggestion.ts';
import { referenceSuggestionKey } from './reference-suggestion.ts';

export function isSuggestionActive(state: EditorState): boolean {
  return commandSuggestionKey.getState(state)?.active === true
    || referenceSuggestionKey.getState(state)?.active === true;
}
