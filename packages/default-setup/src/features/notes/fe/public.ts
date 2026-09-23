// What the notes plugin offers other features: the notes as it holds them.
// Other features import this module, never the plugin's machine.
import type { SnapshotFrom } from 'xstate'
import { usePluginState } from '@abuddy/sdk/fe'
import { ref as featureRef } from '@/__generated__/ref'
import type { NotesState } from './state'

/** The ref the notes plugin runs at */
export const NOTES = featureRef('notes')

/** Every note the notes plugin holds */
export function useNotes() {
  return usePluginState(NOTES, (s: SnapshotFrom<NotesState>) => s.context.notes)
}

/** The reference type a note links as, by its note type */
export const NOTE_TYPE_TO_REFERENCE_TYPE: Record<string, string> = {
  document: 'note',
  task: 'task',
  tasklist: 'tasklist',
}
