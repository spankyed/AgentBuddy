import { ref, computed, type Ref } from 'vue'
import type { LibraryItem } from '@app/api'

const MAX_PROXIMITY = 25

interface DragDropOptions {
  items: Ref<LibraryItem[]>
  selectedItems: Ref<string[]>
  isInSymlinkContext: Ref<boolean>
  currentFolderId: Ref<string | null>
  onMove: (itemIds: string[], targetFolderId: string | null) => void
}

export function useDragDrop({
  items,
  selectedItems,
  isInSymlinkContext,
  currentFolderId,
  onMove
}: DragDropOptions) {
  const draggedItems = ref<string[]>([])
  const draggedOverId = ref<string | null>(null)
  const isDragging = ref(false)

  // Get the items being dragged
  const getDraggedItems = (draggedId: string): string[] => {
    if (selectedItems.value.includes(draggedId)) {
      return selectedItems.value
    }
    return [draggedId]
  }

  // Check if drop is valid
  const isValidDrop = (targetId: string | null): boolean => {
    if (!draggedItems.value.length) return false
    if (targetId && draggedItems.value.includes(targetId)) return false

    // Can't move between symlink and non-symlink contexts
    const sourceIsSymlink = draggedItems.value.some(id => id.startsWith('symlink:'))
    const sourceIsRegular = draggedItems.value.some(id => !id.startsWith('symlink:'))
    const targetIsSymlink = targetId?.startsWith('symlink:') ?? false
    const targetItem = targetId ? items.value.find(i => i.id === targetId) : null
    const targetIsSymlinkRoot = targetItem?.type === 'folder' && (targetItem as any).isSymlink

    if ((sourceIsSymlink && !targetIsSymlink && !targetIsSymlinkRoot) ||
        (sourceIsRegular && (targetIsSymlink || targetIsSymlinkRoot))) {
      return false
    }

    return true
  }

  // Find the nearest folder row to clientY
  const findNearestFolder = (clientY: number): string | null => {
    const folderRows = document.querySelectorAll<HTMLElement>('tr[data-folder-id]')
    let closestId: string | null = null
    let closestDistance = Infinity

    folderRows.forEach(row => {
      const folderId = row.getAttribute('data-folder-id')!
      if (draggedItems.value.includes(folderId)) return

      const rect = row.getBoundingClientRect()
      const rowCenter = rect.top + rect.height / 2
      const distance = Math.abs(clientY - rowCenter)

      if (distance < closestDistance) {
        closestDistance = distance
        closestId = folderId
      }
    })

    if (closestDistance > MAX_PROXIMITY) return null
    return closestId
  }

  // Handle drag start
  const handleDragStart = (e: DragEvent, item: LibraryItem) => {
    if (!e.dataTransfer) return

    const itemsToMove = getDraggedItems(item.id)
    draggedItems.value = itemsToMove
    isDragging.value = true

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(itemsToMove))

    if (itemsToMove.length > 1) {
      const dragImage = document.createElement('div')
      dragImage.className = 'drag-image'
      dragImage.textContent = `${itemsToMove.length} items`
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

  // Handle drag over — find nearest folder via proximity
  const handleDragOver = (e: DragEvent, _item: LibraryItem | null) => {
    e.preventDefault()
    if (!e.dataTransfer) return

    // Suppress visual feedback for symlink items dragged outside symlink context
    if (!_item && draggedItems.value.length) {
      if (draggedItems.value.some(id => id.startsWith('symlink:')) && !isInSymlinkContext.value) {
        e.dataTransfer.dropEffect = 'none'
        return
      }
    }

    e.dataTransfer.dropEffect = 'move'

    const nearestFolderId = findNearestFolder(e.clientY)

    // Validate cross-context before showing highlight
    if (nearestFolderId && !isValidDrop(nearestFolderId)) {
      if (draggedOverId.value !== null) {
        draggedOverId.value = null
      }
      e.dataTransfer.dropEffect = 'none'
      return
    }

    if (draggedOverId.value !== nearestFolderId) {
      draggedOverId.value = nearestFolderId
    }
  }

  // Handle drag enter
  const handleDragEnter = (e: DragEvent, _item: LibraryItem) => {
    e.preventDefault()
  }

  // Handle drag leave
  const handleDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as HTMLElement
    if (!related || !related.closest('.draggable-item')) {
      draggedOverId.value = null
    }
  }

  // Handle drop — only action is move into the targeted folder
  const handleDrop = (e: DragEvent, _targetItem: LibraryItem | null, _targetIndex?: number, _currentFolderId?: string | null) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggedItems.value.length) return

    const targetFolderId = draggedOverId.value

    if (targetFolderId && isValidDrop(targetFolderId)) {
      onMove(draggedItems.value, targetFolderId)
    } else if (!targetFolderId && _targetItem === null) {
      // Drop on empty space — move to current folder (for cross-folder drops)
      const fallback = _currentFolderId !== undefined ? _currentFolderId : currentFolderId.value
      if (draggedItems.value.some(id => id.startsWith('symlink:')) && !isInSymlinkContext.value) {
        handleDragEnd()
        return
      }
      const isCrossFolder = draggedItems.value.some(id => !items.value.some(item => item.id === id))
      if (isCrossFolder) {
        onMove(draggedItems.value, fallback)
      }
    }

    handleDragEnd()
  }

  // Handle drag end
  const handleDragEnd = () => {
    draggedItems.value = []
    draggedOverId.value = null
    isDragging.value = false
  }

  // Computed styles for drag feedback — only highlight folders
  const getItemClass = (item: LibraryItem) => {
    const classes: string[] = []

    if (isDragging.value && draggedItems.value.includes(item.id)) {
      classes.push('opacity-50')
    }

    if (draggedOverId.value === item.id && item.type === 'folder') {
      classes.push('!bg-emerald-500/20 ring-1 ring-emerald-500/50')
    }

    return classes.join(' ')
  }

  return {
    isDragging,
    draggedItems,
    draggedOverId,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    getItemClass
  }
}
