<template>
  <div class="space-y-3">
    <div
      v-for="(field, index) in fields"
      :key="index"
      class="flex items-center gap-2"
    >
      <input
        :value="field.key"
        @input="updateField(index, 'key', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="Key"
        class="flex-1 px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <input
        :value="field.value"
        @input="updateField(index, 'value', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="Value"
        class="flex-1 px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
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

const props = defineProps<{
  content: FieldContent
}>()

const emit = defineEmits<{
  update: [fields: Array<{ key: string; value: string }>]
}>()

const fields = computed(() => props.content.fields)

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
</script>