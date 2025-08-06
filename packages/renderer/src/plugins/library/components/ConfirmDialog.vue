<template>
  <Dialog
    :model-value="modelValue"
    :title="title"
    :description="description"
    @update:model-value="$emit('update:modelValue', $event)"
    @cancel="handleCancel"
  >
    <template #actions>
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium text-gray-300 bg-transparent border border-gray-600 rounded-lg hover:bg-gray-800 hover:border-gray-500 transition-colors"
        @click="handleCancel"
      >
        {{ cancelText || 'Cancel' }}
      </button>
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded-lg hover:bg-red-700 transition-colors"
        @click="handleConfirm"
      >
        {{ confirmText || 'Delete' }}
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from '@/core/design/dialog.vue'

interface Props {
  modelValue: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'cancel': []
  'confirm': []
}>()

function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>