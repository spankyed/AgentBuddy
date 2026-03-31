import { computed, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import type { ThreadExtended, DocumentDTO, NoteDTO } from '@app/api'

export type ReferenceCategory = 'threads' | 'documents' | 'notes'

export interface ReferenceItem {
  id: string
  shortCode: string
  label: string
  type: 'thread' | 'document' | 'note'
}

const CATEGORY_META: Record<ReferenceCategory, { label: string; type: ReferenceItem['type'] }> = {
  threads: { label: 'Threads', type: 'thread' },
  documents: { label: 'Library Documents', type: 'document' },
  notes: { label: 'Notes', type: 'note' },
}

export const categories: { id: ReferenceCategory; label: string }[] = [
  { id: 'threads', label: 'Threads' },
  { id: 'documents', label: 'Library Documents' },
  { id: 'notes', label: 'Notes' },
]

export function useReferenceItems(category: Ref<ReferenceCategory | null>, query: Ref<string>) {
  const threadsActor = applicationState.system.get('threads')
  const libraryActor = applicationState.system.get('library')
  const notesActor = applicationState.system.get('notes')

  const threads = useSelector(threadsActor, (state: any) => state.context.threads as ThreadExtended[])
  const documents = useSelector(libraryActor, (state: any) => state.context.documents as DocumentDTO[])
  const notes = useSelector(notesActor, (state: any) => state.context.notes as NoteDTO[])

  const items = computed<ReferenceItem[]>(() => {
    if (!category.value) return []

    const meta = CATEGORY_META[category.value]
    let raw: ReferenceItem[] = []

    switch (category.value) {
      case 'threads':
        raw = (threads.value || []).map((t: ThreadExtended) => ({
          id: t.id,
          shortCode: t.shortCode || t.id,
          label: t.topic || t.shortCode || t.id,
          type: meta.type,
        }))
        break
      case 'documents':
        raw = (documents.value || []).map((d: DocumentDTO) => ({
          id: d.id,
          shortCode: d.shortCode || d.id,
          label: d.name || d.shortCode || d.id,
          type: meta.type,
        }))
        break
      case 'notes':
        raw = (notes.value || []).filter((n: NoteDTO) => n.noteType !== 'tasklist').map((n: NoteDTO) => ({
          id: n.id,
          shortCode: n.id,
          label: n.title || n.id,
          type: meta.type,
        }))
        break
    }

    const q = query.value.toLowerCase()
    if (q) {
      raw = raw.filter((item) =>
        item.label.toLowerCase().includes(q) || item.shortCode.toLowerCase().includes(q)
      )
    }

    return raw.slice(0, 25)
  })

  return { items }
}
