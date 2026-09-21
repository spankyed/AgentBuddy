// What the notes plugin offers other features: the notes as it holds them.
// Other features import this module, never the plugin's machine.
import { useSelector } from '@xstate/vue'
import { pluginHandle } from '@/features/plugin-handle'
import type { NotesState } from './state'

/** The notes plugin's actor, which its machine binds as it starts */
export const notesPlugin = pluginHandle<NotesState>('notes')

/** Every note the notes plugin holds */
export function useNotes() {
  return useSelector(notesPlugin.get(), (state) => state.context.notes)
}

/** The reference type a note links as, by its note type */
export const NOTE_TYPE_TO_REFERENCE_TYPE: Record<string, string> = {
  document: 'note',
  task: 'task',
  tasklist: 'tasklist',
}
