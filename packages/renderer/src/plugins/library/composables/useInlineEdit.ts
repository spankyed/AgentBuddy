import { ref, nextTick } from 'vue'

export function useInlineEdit(
  emit: (event: 'RENAME_ITEM', payload: { itemId: string; name: string }) => void
) {
  const editingItemId = ref<string | null>(null)
  const editingName = ref('')

  function startEditingItem(itemId: string, currentName: string) {
    editingItemId.value = itemId
    editingName.value = currentName
    nextTick(() => {
      const input = document.querySelector(`#edit-input-${itemId}`) as HTMLInputElement
      if (input) {
        input.focus()
        input.select()
      }
    })
  }

  function confirmEdit(itemId: string) {
    if (editingName.value && editingName.value !== '') {
      emit('RENAME_ITEM', { itemId, name: editingName.value })
    }
    cancelEdit()
  }

  function cancelEdit() {
    editingItemId.value = null
    editingName.value = ''
  }

  return {
    editingItemId,
    editingName,
    startEditingItem,
    confirmEdit,
    cancelEdit
  }
}