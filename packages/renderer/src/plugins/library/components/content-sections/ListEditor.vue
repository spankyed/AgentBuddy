<template>
  <div class="space-y-3">
    <div
      v-for="(item, index) in items"
      :key="index"
      class="flex items-center gap-2"
    >
      <input
        :value="item"
        @input="updateItem(index, ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="List item"
        class="flex-1 px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <button
        @click="removeItem(index)"
        type="button"
        class="p-2 text-neutral-400 hover:text-red-400 transition-colors"
        title="Remove item"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
    <button
      @click="addItem"
      type="button"
      class="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:border-neutral-600"
    >
      <Plus class="w-4 h-4" />
      Add Item
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X, Plus } from 'lucide-vue-next'
import type { ListContent } from '@app/api'

const props = defineProps<{
  content: ListContent
}>()

const emit = defineEmits<{
  update: [items: string[]]
}>()

const items = computed(() => props.content.items)

const updateItem = (index: number, value: string) => {
  const newItems = [...items.value]
  newItems[index] = value
  emit('update', newItems)
}

const addItem = () => {
  emit('update', [...items.value, ''])
}

const removeItem = (index: number) => {
  const newItems = items.value.filter((_, i) => i !== index)
  emit('update', newItems)
}
</script>