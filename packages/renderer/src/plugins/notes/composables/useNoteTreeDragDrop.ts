import { ref, type Ref } from 'vue'
import type { NoteDTO } from '@app/api'

interface NoteTreeDragDropOptions {
  notes: Ref<NoteDTO[]>
  selectedNoteIds: Ref<string[]>
  onMove: (noteIds: string[], newParentId: string | null) => void
}

export function useNoteTreeDragDrop({
  notes,
  selectedNoteIds,
  onMove,
}: NoteTreeDragDropOptions) {
  const draggedNoteIds = ref<string[]>([])
  const draggedOverId = ref<string | null>(null)
  const isDragging = ref(false)

  function getDraggedItems(noteId: string): string[] {
    if (selectedNoteIds.value.includes(noteId)) {
      return [...selectedNoteIds.value]
    }
    return [noteId]
  }

  function isDescendant(noteId: string, ancestorId: string): boolean {
    const children = notes.value.filter(n => n.parentId === ancestorId)
    for (const child of children) {
      if (child.id === noteId) return true
      if (isDescendant(noteId, child.id)) return true
    }
    return false
  }

  function getCurrentParentId(noteId: string): string | null {
    const note = notes.value.find(n => n.id === noteId)
    return note?.parentId ?? null
  }

  function isValidDrop(targetId: string | null): boolean {
    if (!draggedNoteIds.value.length) return false
    // Can't drop on self
    if (targetId && draggedNoteIds.value.includes(targetId)) return false
    // Can't drop on own descendant
    if (targetId) {
      for (const id of draggedNoteIds.value) {
        if (isDescendant(targetId, id)) return false
      }
    }
    // Can't drop on current parent (all items must share same parent for this to be a no-op)
    const allSameParent = draggedNoteIds.value.every(
      id => getCurrentParentId(id) === targetId
    )
    if (allSameParent) return false
    return true
  }

  function handleDragStart(e: DragEvent, noteId: string) {
    if (!e.dataTransfer) return
    const items = getDraggedItems(noteId)
    draggedNoteIds.value = items
    isDragging.value = true
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(items))

    if (items.length > 1) {
      const dragImage = document.createElement('div')
      dragImage.textContent = `${items.length} notes`
      dragImage.style.position = 'absolute'
      dragImage.style.top = '-1000px'
      dragImage.style.padding = '4px 8px'
      dragImage.style.background = 'rgba(59, 130, 246, 0.9)'
      dragImage.style.color = 'white'
      dragImage.style.borderRadius = '4px'
      dragImage.style.fontSize = '12px'
      document.body.appendChild(dragImage)
      e.dataTransfer.setDragImage(dragImage, 0, 0)
      setTimeout(() => document.body.removeChild(dragImage), 0)
    }
  }

  function handleDragOver(e: DragEvent, noteId: string) {
    e.preventDefault()
    if (!e.dataTransfer) return

    if (!isValidDrop(noteId)) {
      e.dataTransfer.dropEffect = 'none'
      draggedOverId.value = null
      return
    }
    e.dataTransfer.dropEffect = 'move'
    if (draggedOverId.value !== noteId) {
      draggedOverId.value = noteId
    }
  }

  function handleDragLeave(e: DragEvent) {
    const related = e.relatedTarget as HTMLElement
    if (!related || !related.closest('[data-note-tree-item]')) {
      draggedOverId.value = null
    }
  }

  function handleDrop(e: DragEvent, targetId: string | null) {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedNoteIds.value.length) return
    if (!isValidDrop(targetId)) {
      handleDragEnd()
      return
    }
    onMove(draggedNoteIds.value, targetId)
    handleDragEnd()
  }

  function handleDragEnd() {
    draggedNoteIds.value = []
    draggedOverId.value = null
    isDragging.value = false
  }

  function getItemClass(noteId: string): string {
    const classes: string[] = []
    if (isDragging.value && draggedNoteIds.value.includes(noteId)) {
      classes.push('opacity-50')
    }
    if (draggedOverId.value === noteId && isValidDrop(noteId)) {
      classes.push('!bg-blue-500/20 ring-2 ring-blue-500')
    }
    if (selectedNoteIds.value.includes(noteId)) {
      classes.push('!bg-blue-500/10')
    }
    return classes.join(' ')
  }

  return {
    isDragging,
    draggedNoteIds,
    draggedOverId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    getItemClass,
  }
}
