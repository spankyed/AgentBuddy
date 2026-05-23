import { computed, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import type { ThreadExtended, DocumentDTO, NoteDTO, CollectionDTO } from '@app/api'
import { threadsFromStore } from '@/plugins/threads/state'
import { CATEGORIES, NOTE_TYPE_TO_REF_TYPE, type ReferenceCategory, type ReferenceRefType } from './reference-config'

export type { ReferenceCategory } from './reference-config'
export { CATEGORIES } from './reference-config'

export interface ReferenceItem {
  id: string
  shortCode: string
  label: string
  type: ReferenceRefType
}

function flattenCollections(colls: CollectionDTO[]): CollectionDTO[] {
  const result: CollectionDTO[] = []
  for (const c of colls) {
    result.push(c)
    if (c.childCollections?.length) {
      result.push(...flattenCollections(c.childCollections))
    }
  }
  return result
}

export function useReferenceItems(category: Ref<ReferenceCategory | null>, query: Ref<string>) {
  const threadsActor = applicationState.system.get('threads')
  const libraryActor = applicationState.system.get('library')
  const notesActor = applicationState.system.get('notes')

  const threadMap = useSelector(threadsActor, (state: any) => state.context.threadMap as Record<string, ThreadExtended>)
  const threadIds = useSelector(threadsActor, (state: any) => state.context.threadIds as string[])
  const threads = computed(() => threadsFromStore(threadMap.value, threadIds.value))
  const documents = useSelector(libraryActor, (state: any) => state.context.documents as DocumentDTO[])
  const collections = useSelector(libraryActor, (state: any) => state.context.collections as CollectionDTO[])
  const notes = useSelector(notesActor, (state: any) => state.context.notes as NoteDTO[])

  const items = computed<ReferenceItem[]>(() => {
    if (!category.value) return []

    let raw: ReferenceItem[] = []

    switch (category.value) {
      case 'threads':
        raw = (threads.value || []).map((t: ThreadExtended) => ({
          id: t.id,
          shortCode: t.shortCode || t.id,
          label: t.topic || t.shortCode || t.id,
          type: 'thread' as const,
        }))
        break
      case 'documents': {
        const docItems: ReferenceItem[] = (documents.value || []).map((d: DocumentDTO) => ({
          id: d.id,
          shortCode: d.shortCode || d.id,
          label: d.name || d.shortCode || d.id,
          type: 'document' as const,
        }))

        const folderItems: ReferenceItem[] = flattenCollections(collections.value || []).map((c) => ({
          id: c.id,
          shortCode: c.id,
          label: c.name || c.id,
          type: 'folder' as const,
        }))

        raw = [...folderItems, ...docItems]
        break
      }
      case 'notes':
        raw = (notes.value || [])
          .filter((n: NoteDTO) => n.noteType in NOTE_TYPE_TO_REF_TYPE)
          .map((n: NoteDTO) => ({
            id: n.id,
            shortCode: n.id,
            label: n.title || n.id,
            type: NOTE_TYPE_TO_REF_TYPE[n.noteType] as ReferenceRefType,
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
