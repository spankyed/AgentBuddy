import { openPlugin, usePluginState } from '#generated/fe.ts'
import { NOTE_TYPE_TO_REFERENCE_TYPE } from '#extensions/tiptap/reference-config.ts'
import { id as notes } from './state.ts'
import type { ReferenceItem } from '@apackdev/sdk/fe/references'

export function openNote(refId: string) {
  openPlugin(notes, { type: 'NOTE.OPEN', noteId: refId })
}

export const useItems = () => usePluginState('notes', (state): ReferenceItem[] => {
  const allNotes = state.notes
  return allNotes
    .filter((n: any) => n.noteType in NOTE_TYPE_TO_REFERENCE_TYPE)
    .map((n: any) => ({
      id: n.id,
      shortCode: n.id,
      label: n.title || n.id,
      type: NOTE_TYPE_TO_REFERENCE_TYPE[n.noteType] as string,
    }))
})
