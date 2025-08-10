<template>
  <div class="space-y-3">
    <div
      v-for="(field, index) in fields"
      :key="index"
      class="flex items-center gap-2"
    >
      <Autocomplete
        :model-value="field.key"
        @update:model-value="(value) => updateField(index, 'key', value)"
        @enter="handleKeyEnter(index)"
        :suggestions="commonKeys"
        placeholder="Key"
        input-class="field-editor-key flex-1 px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <input
        :value="field.value"
        @input="updateField(index, 'value', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="handleValueEnter(index)"
        type="text"
        placeholder="Value"
        class="field-editor-value flex-1 px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <button
        @click="removeField(index)"
        type="button"
        class="p-2 text-neutral-400 hover:text-red-400 transition-colors"
        title="Remove field"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
    <button
      @click="addField"
      type="button"
      class="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:border-neutral-600"
    >
      <Plus class="w-4 h-4" />
      Add Field
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X, Plus } from 'lucide-vue-next'
import type { FieldContent } from '@app/api'
import Autocomplete from '@/design/components/Autocomplete.vue'

const props = defineProps<{
  content: FieldContent
}>()

const emit = defineEmits<{
  update: [fields: Array<{ key: string; value: string }>]
}>()

const fields = computed(() => props.content.fields)

const commonKeys = [
  'action',
  'directory',
  'id',
  'value',
  'name',
  'type',
  'path',
  'url',
  'description',
  'status',
  'message',
  'data',
  'config',
]

const updateField = (index: number, field: 'key' | 'value', value: string) => {
  const newFields = [...fields.value]
  newFields[index] = { ...newFields[index], [field]: value }
  emit('update', newFields)
}

const addField = () => {
  emit('update', [...fields.value, { key: '', value: '' }])
}

const removeField = (index: number) => {
  const newFields = fields.value.filter((_, i) => i !== index)
  emit('update', newFields)
}

const handleKeyEnter = (index: number) => {
  // Move focus to value input
  setTimeout(() => {
    const valueInputs = document.querySelectorAll<HTMLInputElement>('.field-editor-value')
    if (valueInputs[index]) {
      valueInputs[index].focus()
    }
  }, 0)
}

const handleValueEnter = (index: number) => {
  // Only add new field if current one has content
  const field = fields.value[index]
  if (field.key.trim() || field.value.trim()) {
    const newFields = [...fields.value]
    // Insert new empty field after current one
    newFields.splice(index + 1, 0, { key: '', value: '' })
    emit('update', newFields)
    
    // Focus the new key input after Vue updates the DOM
    setTimeout(() => {
      const keyInputs = document.querySelectorAll<HTMLInputElement>('.field-editor-key')
      if (keyInputs[index + 1]) {
        keyInputs[index + 1].focus()
      }
    }, 0)
  }
}
</script>