<template>
  <Dialog
    :model-value="modelValue"
    :title="title"
    :description="description"
    @update:model-value="$emit('update:modelValue', $event)"
    @cancel="handleCancel"
  >
    <form id="input-form" @submit.prevent="handleSubmit" class="flex flex-col gap-4">
      <input
        v-model="localValue"
        type="text"
        class="w-full px-4 py-2 bg-[#0a0a0a] border border-[#262626] rounded-lg text-[#e0e0e0] text-sm outline-none transition-all duration-200 focus:border-cyan-400 focus:shadow-[0_0_0_2px_rgba(0,188,212,0.1)]"
        :placeholder="placeholder"
        autofocus
        @keydown.escape="handleCancel"
      />
    </form>
    
    <template #actions>
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium text-gray-300 bg-transparent border border-gray-600 rounded-lg hover:bg-gray-800 hover:border-gray-500 transition-colors"
        @click="handleCancel"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="input-form"
        class="px-4 py-2 text-sm font-medium text-white bg-cyan-600 border border-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors"
      >
        {{ confirmText || 'OK' }}
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from '@/core/design/dialog.vue'

interface Props {
  modelValue: boolean
  title: string
  description?: string
  placeholder?: string
  initialValue?: string
  confirmText?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'cancel': []
  'confirm': [value: string]
}>()

const localValue = ref('')

// Update local value when initial value changes or dialog opens
watch(() => [props.modelValue, props.initialValue], ([isOpen, initial]) => {
  if (isOpen) {
    localValue.value = initial || ''
  }
}, { immediate: true })

function handleSubmit() {
  if (localValue.value.trim()) {
    emit('confirm', localValue.value.trim())
    emit('update:modelValue', false)
    localValue.value = ''
  }
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
  localValue.value = ''
}
</script>