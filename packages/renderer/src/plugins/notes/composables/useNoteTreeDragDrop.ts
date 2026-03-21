import { ref, computed, type Ref } from 'vue'
import type { NoteDTO } from '@app/api'

type DropPosition = 'before' | 'after' | 'on'

interface DropTarget {
  noteId: string
  position: DropPosition
}

interface NoteTreeDragDropOptions {
  notes: Ref<NoteDTO[]>
  selectedNoteIds: Ref<string[]>
  currentNoteId: Ref<string | null>
  onMove: (noteIds: string[], newParentId: string | null) => void
  onReorder?: (noteId: string, newParentId: string | null, newIndex: number) => void
}

export function useNoteTreeDragDrop({
  notes,
  selectedNoteIds,
  currentNoteId,
  onMove,
  onReorder,
}: NoteTreeDragDropOptions) {
  const draggedNoteIds = ref<string[]>([])
  const dropTarget = ref<DropTarget | null>(null)
  const isDragging = ref(false)
  let dragLeaveTimer: ReturnType<typeof setTimeout> | null = null

  function getDraggedItems(noteId: string): string[] {
    const effective = new Set(selectedNoteIds.value)
    if (currentNoteId.value) effective.add(currentNoteId.value)
    if (effective.has(noteId)) {
      return [...effective]
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

  function isValidDrop(targetId: string | null, position: DropPosition): boolean {
    if (!draggedNoteIds.value.length) return false

    if (position === 'before' || position === 'after') {
      // Reorder mode: only single-item
      if (draggedNoteIds.value.length > 1) return false
      const draggedId = draggedNoteIds.value[0]

      // Can't drop on self
      if (targetId === draggedId) return false

      // Can't drop on own descendant
      if (targetId && isDescendant(targetId, draggedId)) return false

      // Block if target is completed
      if (targetId) {
        const target = notes.value.find(n => n.id === targetId)
        if (target?.completed) return false
      }

      return true
    }

    // 'on' mode — reparent
    if (targetId && draggedNoteIds.value.includes(targetId)) return false
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

    // Tasks can only be dropped on tasks or tasklists, not regular notes
    if (targetId) {
      const target = notes.value.find(n => n.id === targetId)
      const hasDraggedTask = draggedNoteIds.value.some(id => {
        const note = notes.value.find(n => n.id === id)
        return note?.noteType === 'task'
      })
      if (hasDraggedTask && target?.noteType !== 'task' && target?.noteType !== 'tasklist') {
        return false
      }
    }

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

    // Cancel any pending drag-leave clear
    if (dragLeaveTimer) {
      clearTimeout(dragLeaveTimer)
      dragLeaveTimer = null
    }

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const relativeY = (e.clientY - rect.top) / rect.height

    let position: DropPosition
    if (relativeY < 0.25) {
      position = 'before'
    } else if (relativeY > 0.75) {
      position = 'after'
    } else {
      position = 'on'
    }

    if (!isValidDrop(noteId, position)) {
      // Try falling back to 'on' if before/after isn't valid
      if (position !== 'on' && isValidDrop(noteId, 'on')) {
        position = 'on'
      } else {
        e.dataTransfer.dropEffect = 'none'
        dropTarget.value = null
        return
      }
    }

    e.dataTransfer.dropEffect = 'move'
    dropTarget.value = { noteId, position }
  }

  function handleDragLeave(_e: DragEvent) {
    // Defer clearing so the next dragover (on an adjacent item) can cancel it.
    // This prevents flicker when the cursor crosses gaps between items.
    if (dragLeaveTimer) clearTimeout(dragLeaveTimer)
    dragLeaveTimer = setTimeout(() => {
      dropTarget.value = null
      dragLeaveTimer = null
    }, 50)
  }

  function handleDrop(e: DragEvent, targetId: string | null) {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedNoteIds.value.length) return

    const currentTarget = dropTarget.value
    const position = currentTarget?.position ?? 'on'

    // For root drop or 'on' position: reparent
    if (!targetId || position === 'on') {
      if (!isValidDrop(targetId, 'on')) {
        handleDragEnd()
        return
      }
      onMove(draggedNoteIds.value, targetId)
      handleDragEnd()
      return
    }

    // For before/after: reorder
    if ((position === 'before' || position === 'after') && onReorder) {
      if (!isValidDrop(targetId, position)) {
        handleDragEnd()
        return
      }

      const targetNote = notes.value.find(n => n.id === targetId)
      if (!targetNote) {
        handleDragEnd()
        return
      }

      const parentId = targetNote.parentId
      const siblings = notes.value
        .filter(n => (n.parentId ?? null) === (parentId ?? null))
        .sort((a, b) => a.displayOrder - b.displayOrder)

      const targetIndex = siblings.findIndex(s => s.id === targetId)
      let newIndex = position === 'before' ? targetIndex : targetIndex + 1

      // Adjust if dragged note is in same parent and before the target
      const draggedId = draggedNoteIds.value[0]
      const draggedNote = notes.value.find(n => n.id === draggedId)
      if (draggedNote && (draggedNote.parentId ?? null) === (parentId ?? null)) {
        const draggedIndex = siblings.findIndex(s => s.id === draggedId)
        if (draggedIndex < newIndex) {
          newIndex -= 1
        }
      }

      onReorder(draggedId, parentId, newIndex)
    }

    handleDragEnd()
  }

  function cancelDragLeave() {
    if (dragLeaveTimer) {
      clearTimeout(dragLeaveTimer)
      dragLeaveTimer = null
    }
  }

  function handleDragEnd() {
    if (dragLeaveTimer) {
      clearTimeout(dragLeaveTimer)
      dragLeaveTimer = null
    }
    draggedNoteIds.value = []
    dropTarget.value = null
    isDragging.value = false
  }

  function getItemClass(noteId: string): string {
    const classes: string[] = []
    if (isDragging.value && draggedNoteIds.value.includes(noteId)) {
      classes.push('opacity-50')
    }
    if (dropTarget.value?.noteId === noteId && dropTarget.value.position === 'on' && isValidDrop(noteId, 'on')) {
      classes.push('!bg-blue-500/20 ring-2 ring-blue-500')
    }
    if (selectedNoteIds.value.includes(noteId) && noteId !== currentNoteId.value) {
      classes.push('!bg-neutral-700/20')
    }
    return classes.join(' ')
  }

  const dropIndicator = computed(() => {
    if (!dropTarget.value) return null
    if (dropTarget.value.position === 'on') return null
    return {
      noteId: dropTarget.value.noteId,
      position: dropTarget.value.position,
    }
  })

  return {
    isDragging,
    draggedNoteIds,
    dropTarget,
    dropIndicator,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    cancelDragLeave,
    getItemClass,
  }
}
