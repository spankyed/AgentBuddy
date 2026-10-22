import type { EditorState } from '@tiptap/pm/state';
import { referenceSuggestionKey } from './reference-suggestion.ts';

/**
 * Whether one of **this pack's** suggestions is open.
 *
 * It used to ask the command key too, across two unrelated suggestion systems. The command suggestion
 * is the editor's own now, so it answers for its own key and this answers for the one pack still owns.
 */
export function isSuggestionActive(state: EditorState): boolean {
  return referenceSuggestionKey.getState(state)?.active === true;
}
