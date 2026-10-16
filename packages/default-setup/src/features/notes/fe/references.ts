import { usePluginState } from '#generated/fe.ts'
import { NOTE_TYPE_TO_REFERENCE_TYPE } from '../reference-types.ts'
import type { ReferenceItem } from '@apackdev/sdk/fe/references'

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
