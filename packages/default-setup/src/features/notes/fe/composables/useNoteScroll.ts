import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useSelector } from '@xstate/vue'
import type { NotesState } from '../state'

export function useNoteScroll(actor: NotesState, getNoteId: () => string | undefined) {
  const scrollContainerRef = ref<HTMLElement | null>(null)
  const scrollPositions = useSelector(actor, (s) => s.context.noteScrollPositions)

  const save = (noteId: string) => {
    const el = scrollContainerRef.value
    if (!el) return
    actor.send({ type: 'NOTE.SAVE_SCROLL', noteId, scrollTop: el.scrollTop })
  }

  const restore = (noteId: string) => {
    const target = scrollPositions.value[noteId] ?? 0
    const attempt = (retries: number) => {
      const el = scrollContainerRef.value
      if (!el) return
      if (target > el.scrollHeight - el.clientHeight && retries > 0) {
        requestAnimationFrame(() => attempt(retries - 1))
        return
      }
      el.scrollTop = target
    }
    nextTick(() => requestAnimationFrame(() => attempt(30)))
  }

  watch(getNoteId, (newId, oldId) => {
    if (oldId) save(oldId)
    if (newId && newId !== oldId) restore(newId)
  }, { flush: 'pre', immediate: true })

  onBeforeUnmount(() => {
    const noteId = getNoteId()
    if (noteId) save(noteId)
  })

  return scrollContainerRef
}
