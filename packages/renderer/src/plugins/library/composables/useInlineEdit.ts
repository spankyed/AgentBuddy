import { ref } from 'vue'

export function useInlineEdit(
  emit: (event: 'RENAME_ITEM', payload: { itemId: string; name: string }) => void
) {
  const editingItemId = ref<string | null>(null)
  const editingName = ref('')
  const originalName = ref('')

  function startEditingItem(itemId: string, currentName: string) {
    editingItemId.value = itemId
    editingName.value = currentName
    originalName.value = currentName
    setTimeout(() => {
      const input = document.querySelector(`#edit-input-${itemId}`) as HTMLInputElement
      if (input) {
        input.focus()
        input.select()
      }
    }, 50)
  }

  function confirmEdit(itemId: string) {
    const trimmedName = editingName.value.trim()
    // Only emit rename if the name actually changed
    if (trimmedName && trimmedName !== originalName.value) {
      emit('RENAME_ITEM', { itemId, name: trimmedName })
    }
    cancelEdit()
  }

  function cancelEdit() {
    editingItemId.value = null
    editingName.value = ''
    originalName.value = ''
  }

  return {
    editingItemId,
    editingName,
    startEditingItem,
    confirmEdit,
    cancelEdit
  }
}