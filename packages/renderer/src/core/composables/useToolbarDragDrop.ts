import { ref, type Ref } from 'vue'
import type { Plugin } from '@/core/types'

interface ToolbarDragDropOptions {
  plugins: Ref<Plugin[]>
  onReorder: (pluginId: string, targetIndex: number, isPinnedSection: boolean) => void
}

export function useToolbarDragDrop({
  plugins,
  onReorder
}: ToolbarDragDropOptions) {
  const draggedPluginId = ref<string | null>(null)
  const draggedOverId = ref<string | null>(null)
  const dropPosition = ref<'before' | 'after' | null>(null)
  const isDragging = ref(false)
  const draggedFromPinned = ref(false)

  // Handle drag start
  const handleDragStart = (e: DragEvent, plugin: Plugin) => {
    if (!e.dataTransfer) return
    
    draggedPluginId.value = plugin.id
    isDragging.value = true
    draggedFromPinned.value = plugin.isPinned || false
    
    // Set drag data
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', plugin.id)
    
    // Make the drag image slightly transparent
    const target = e.target as HTMLElement
    setTimeout(() => {
      target.style.opacity = '0.5'
    }, 0)
  }

  // Handle drag over
  const handleDragOver = (e: DragEvent, targetPlugin: Plugin | null, isPinnedSection: boolean) => {
    e.preventDefault()
    if (!e.dataTransfer) return
    
    e.dataTransfer.dropEffect = 'move'
    
    // Determine drop position based on mouse position
    if (targetPlugin) {
      // Find the button element within the wrapper for accurate positioning
      const wrapper = e.currentTarget as HTMLElement
      const button = wrapper.querySelector('button')
      
      let newPosition: 'before' | 'after'
      
      if (button) {
        const rect = button.getBoundingClientRect()
        const y = e.clientY - rect.top
        const height = rect.height
        
        // For vertical layout, determine if dropping before or after
        // If mouse is in top half, drop before. If in bottom half, drop after.
        newPosition = y < height / 2 ? 'before' : 'after'
      } else {
        // Fallback to wrapper measurements if button not found
        const rect = wrapper.getBoundingClientRect()
        const y = e.clientY - rect.top
        const height = rect.height
        
        newPosition = y < height / 2 ? 'before' : 'after'
      }
      
      // Only update if changed to reduce re-renders
      if (dropPosition.value !== newPosition || draggedOverId.value !== targetPlugin.id) {
        dropPosition.value = newPosition
        draggedOverId.value = targetPlugin.id
      }
    } else {
      // Dragging over empty space in a section
      if (draggedOverId.value !== null || dropPosition.value !== 'after') {
        draggedOverId.value = null
        dropPosition.value = 'after'
      }
    }
  }

  // Handle drag enter
  const handleDragEnter = (e: DragEvent, plugin: Plugin | null) => {
    e.preventDefault()
    if (plugin) {
      draggedOverId.value = plugin.id
    }
  }

  // Handle drag leave
  const handleDragLeave = (e: DragEvent) => {
    // Only clear if we're leaving the drop zone entirely
    const related = e.relatedTarget as HTMLElement
    if (!related || !related.closest('.toolbar-item')) {
      draggedOverId.value = null
      dropPosition.value = null
    }
  }

  // Handle drop
  const handleDrop = (e: DragEvent, targetPlugin: Plugin | null, targetIndex: number, isPinnedSection: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!draggedPluginId.value) return
    
    let adjustedIndex = targetIndex
    
    if (targetPlugin) {
      // When dropping on a specific plugin, check the mouse position at drop time
      // Find the button element within the wrapper for accurate positioning
      const wrapper = e.currentTarget as HTMLElement
      const button = wrapper.querySelector('button')
      
      if (button) {
        const rect = button.getBoundingClientRect()
        const y = e.clientY - rect.top
        const height = rect.height
        
        // Determine if we're dropping before or after based on mouse position relative to button
        const isDropBefore = y < height / 2
        
        // If dropping after, increment the index
        if (!isDropBefore) {
          adjustedIndex = targetIndex + 1
        }
      } else {
        // Fallback to wrapper measurements if button not found
        const rect = wrapper.getBoundingClientRect()
        const y = e.clientY - rect.top
        const height = rect.height
        
        const isDropBefore = y < height / 2
        if (!isDropBefore) {
          adjustedIndex = targetIndex + 1
        }
      }
    } else if (!targetPlugin) {
      // Dropping in empty space - use the provided index (end of list)
      // No adjustment needed
    }
    
    // Emit the reorder event
    onReorder(draggedPluginId.value, adjustedIndex, isPinnedSection)
    
    // Reset drag state
    handleDragEnd()
  }

  // Handle drag end
  const handleDragEnd = (e?: DragEvent) => {
    // Reset opacity if event target exists
    if (e?.target) {
      const target = e.target as HTMLElement
      target.style.opacity = ''
    }
    
    draggedPluginId.value = null
    draggedOverId.value = null
    dropPosition.value = null
    isDragging.value = false
    draggedFromPinned.value = false
  }

  // Get classes for drag feedback
  const getItemClass = (plugin: Plugin) => {
    const classes: string[] = ['toolbar-item']
    
    if (isDragging.value && draggedPluginId.value === plugin.id) {
      classes.push('dragging')
    }
    
    return classes.join(' ')
  }
  
  // Get button hover class based on drop position
  const getButtonClass = (plugin: Plugin) => {
    const classes: string[] = []
    
    if (isDragging.value && draggedOverId.value === plugin.id && dropPosition.value) {
      // Add class based on where the item will be dropped
      if (dropPosition.value === 'before') {
        classes.push('drop-zone-before')
      } else if (dropPosition.value === 'after') {
        classes.push('drop-zone-after')
      }
    }
    
    return classes.join(' ')
  }

  // Get drop indicator style - shows a line where the item will be inserted
  const getDropIndicatorStyle = (plugin: Plugin) => {
    if (!isDragging.value || draggedOverId.value !== plugin.id || !dropPosition.value) {
      return {}
    }
    
    // Return class names instead of inline styles for better control
    return dropPosition.value === 'before' ? 'drop-indicator-before' : 'drop-indicator-after'
  }

  return {
    isDragging,
    draggedPluginId,
    draggedOverId,
    dropPosition,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    getItemClass,
    getButtonClass,
    getDropIndicatorStyle
  }
}