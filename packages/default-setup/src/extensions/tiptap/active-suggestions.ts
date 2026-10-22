import type { EditorState } from '@tiptap/pm/state';
import { referenceSuggestionKey } from './reference-suggestion.ts';

/**
 * Whether one of **this pack's** suggestions is open, which is what holds Escape for it.
 *
 * Only the keys this pack owns: the editor's built-in suggestions answer for theirs, and a group's
 * predicate is asked about its own group alone.
 */
export function isSuggestionActive(state: EditorState): boolean {
  return referenceSuggestionKey.getState(state)?.active === true;
}
