import { ref, computed, type Ref } from 'vue'
import type { LibraryItem } from '@app/api'

interface DragDropOptions {
  items: Ref<LibraryItem[]>
  selectedItems: Ref<string[]>
  onMove: (itemIds: string[], targetFolderId: string | null) => void
  onReorder: (itemIds: string[], targetIndex: number, targetFolderId: string | null) => void
}

export function useDragDrop({
  items,
  selectedItems,
  onMove,
  onReorder
}: DragDropOptions) {
  const draggedItems = ref<string[]>([])
  const draggedOverId = ref<string | null>(null)
  const dropPosition = ref<'before' | 'after' | 'inside' | null>(null)
  const isDragging = ref(false)

  // Get the items being dragged
  const getDraggedItems = (draggedId: string): string[] => {
    // If the dragged item is in the selection, drag all selected items
    if (selectedItems.value.includes(draggedId)) {
      return selectedItems.value
    }
    // Otherwise just drag the single item
    return [draggedId]
  }

  // Check if drop is valid
  const isValidDrop = (targetId: string | null, targetType: 'folder' | 'document' | null): boolean => {
    if (!draggedItems.value.length) return false

    // Can't drop on itself
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

    // Can't drop a folder into its own children
    if (targetType === 'folder') {
      // TODO: Check for circular reference
      return true
    }

    return true
  }

  // Handle drag start
  const handleDragStart = (e: DragEvent, item: LibraryItem) => {
    if (!e.dataTransfer) return
    
    const itemsToMove = getDraggedItems(item.id)
    draggedItems.value = itemsToMove
    isDragging.value = true
    
    // Set drag data
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(itemsToMove))
    
    // Create custom drag image if multiple items
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

  // Handle drag over
  const handleDragOver = (e: DragEvent, item: LibraryItem | null, index?: number) => {
    e.preventDefault()
    if (!e.dataTransfer) return
    
    e.dataTransfer.dropEffect = 'move'
    
    // Determine drop position based on mouse position
    if (item) {
      const target = e.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      const y = e.clientY - rect.top
      const height = rect.height
      
      let newPosition: 'before' | 'after' | 'inside'
      
      if (item.type === 'folder') {
        // For folders, we can drop inside or reorder
        if (y < height * 0.25) {
          newPosition = 'before'
        } else if (y > height * 0.75) {
          newPosition = 'after'
        } else {
          newPosition = 'inside'
        }
      } else {
        // For documents, only reorder
        newPosition = y < height / 2 ? 'before' : 'after'
      }
      
      // Only update if changed to reduce re-renders
      if (dropPosition.value !== newPosition || draggedOverId.value !== item.id) {
        dropPosition.value = newPosition
        draggedOverId.value = item.id
      }
    } else {
      // Dragging over empty space
      if (draggedOverId.value !== null || dropPosition.value !== null) {
        draggedOverId.value = null
        dropPosition.value = null
      }
    }
  }

  // Handle drag enter
  const handleDragEnter = (e: DragEvent, item: LibraryItem) => {
    e.preventDefault()
    draggedOverId.value = item.id
  }

  // Handle drag leave
  const handleDragLeave = (e: DragEvent) => {
    // Only clear if we're leaving the drop zone entirely
    const related = e.relatedTarget as HTMLElement
    if (!related || !related.closest('.draggable-item')) {
      draggedOverId.value = null
      dropPosition.value = null
    }
  }

  // Handle drop
  const handleDrop = (e: DragEvent, targetItem: LibraryItem | null, targetIndex?: number, currentFolderId?: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!draggedItems.value.length) return
    
    if (targetItem && dropPosition.value === 'inside' && targetItem.type === 'folder') {
      // Moving into a folder
      if (isValidDrop(targetItem.id, 'folder')) {
        onMove(draggedItems.value, targetItem.id)
      }
    } else if (dropPosition.value === 'before' || dropPosition.value === 'after') {
      // Disable reorder for symlink items (filesystem order is alphabetical)
      if (draggedItems.value.some(id => id.startsWith('symlink:'))) {
        handleDragEnd()
        return
      }
      const currentItems = items.value
      const targetIdx = targetIndex ?? currentItems.findIndex(item => item.id === targetItem?.id)

      if (targetIdx !== -1) {
        const folderId = currentFolderId !== undefined ? currentFolderId : (targetItem?.parentId ?? null)
        const isCrossFolder = draggedItems.value.some(id => !currentItems.some(item => item.id === id))

        if (isCrossFolder) {
          onMove(draggedItems.value, folderId)
        } else {
          const adjustedIndex = dropPosition.value === 'after' ? targetIdx + 1 : targetIdx
          onReorder(draggedItems.value, adjustedIndex, folderId)
        }
      }
    } else if (!targetItem) {
      const folderId = currentFolderId ?? null
      const isCrossFolder = draggedItems.value.some(id => !items.value.some(item => item.id === id))

      if (isCrossFolder) {
        onMove(draggedItems.value, folderId)
      } else if (targetIndex !== undefined) {
        onReorder(draggedItems.value, targetIndex, folderId)
      }
    }
    
    // Reset drag state
    handleDragEnd()
  }

  // Handle drag end
  const handleDragEnd = () => {
    draggedItems.value = []
    draggedOverId.value = null
    dropPosition.value = null
    isDragging.value = false
  }

  // Computed styles for drag feedback
  const getItemClass = (item: LibraryItem) => {
    const classes: string[] = []
    
    if (isDragging.value && draggedItems.value.includes(item.id)) {
      classes.push('opacity-50')
    }
    
    if (draggedOverId.value === item.id) {
      if (dropPosition.value === 'inside' && item.type === 'folder') {
        classes.push('!bg-blue-500/20 ring-2 ring-blue-500')
      }
    }
    
    return classes.join(' ')
  }

  // Get drop indicator position
  const getDropIndicatorStyle = (item: LibraryItem) => {
    if (draggedOverId.value !== item.id || !dropPosition.value || dropPosition.value === 'inside') {
      return { display: 'none' }
    }
    
    return {
      display: 'block',
      position: 'absolute' as const,
      left: '0',
      right: '0',
      height: '2px',
      backgroundColor: 'rgb(59, 130, 246)',
      ...(dropPosition.value === 'before' ? { top: '0' } : { bottom: '0' })
    }
  }

  return {
    isDragging,
    draggedItems,
    draggedOverId,
    dropPosition,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    getItemClass,
    getDropIndicatorStyle
  }
}