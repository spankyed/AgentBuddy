import { ref, computed } from 'vue'
import type { LibraryItem } from '@app/api'

export function useSelection(
  items: () => LibraryItem[],
  selectedItems: () => string[],
  emit: (event: 'SELECT_ITEMS', payload: { itemIds: string[] }) => void
) {
  const shiftAnchorId = ref<string | null>(null)
  const lastSelectedItemId = ref<string | null>(null)

  const allItemsSelected = computed(() => {
    const itemsList = items()
    return itemsList.length > 0 && itemsList.every(item => selectedItems().includes(item.id))
  })

  function selectItem(item: LibraryItem, sortedItems: LibraryItem[], event: MouseEvent) {
    if (event.shiftKey && shiftAnchorId.value) {
      // Range select
      const anchorIndex = sortedItems.findIndex(i => i.id === shiftAnchorId.value)
      const clickedIndex = sortedItems.findIndex(i => i.id === item.id)
      
      if (anchorIndex !== -1 && clickedIndex !== -1) {
        const start = Math.min(anchorIndex, clickedIndex)
        const end = Math.max(anchorIndex, clickedIndex)
        const rangeIds = sortedItems.slice(start, end + 1).map(i => i.id)
        const newSelection = Array.from(new Set([...selectedItems(), ...rangeIds]))
        emit('SELECT_ITEMS', { itemIds: newSelection })
      }
    } else if (event.metaKey || event.ctrlKey) {
      // Multi-select toggle
      const current = selectedItems()
      const newSelection = current.includes(item.id)
        ? current.filter(id => id !== item.id)
        : [...current, item.id]
      emit('SELECT_ITEMS', { itemIds: newSelection })
      
      if (newSelection.length !== 1) {
        lastSelectedItemId.value = null
      }
      shiftAnchorId.value = item.id
    } else {
      // Single select
      emit('SELECT_ITEMS', { itemIds: [item.id] })
      lastSelectedItemId.value = item.id
      shiftAnchorId.value = item.id
    }
  }

  function toggleSelectAll() {
    if (allItemsSelected.value) {
      emit('SELECT_ITEMS', { itemIds: [] })
    } else {
      emit('SELECT_ITEMS', { itemIds: items().map(item => item.id) })
    }
  }

  function clearSelection() {
    emit('SELECT_ITEMS', { itemIds: [] })
    shiftAnchorId.value = null
    lastSelectedItemId.value = null
  }

  return {
    lastSelectedItemId,
    allItemsSelected,
    selectItem,
    toggleSelectAll,
    clearSelection
  }
}