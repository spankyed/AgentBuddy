<template>
  <div class="space-y-3">
    <!-- Bulk Add Mode -->
    <div v-if="showBulkMode" class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">
            Bulk Add
          </label>
          <span v-if="bulkText.trim()" class="text-xs text-neutral-500">
            {{ itemCount }} {{ itemCount === 1 ? 'item' : 'items' }} detected
          </span>
        </div>
        <label class="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer hover:text-neutral-400 transition-colors">
          <input
            v-model="splitByParagraphs"
            type="checkbox"
            class="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-neutral-400 focus:ring-0 focus:ring-offset-0 checked:bg-neutral-700 checked:border-neutral-600"
          />
          <span>Split by paragraphs</span>
        </label>
      </div>
      <textarea
        v-model="bulkText"
        :placeholder="splitByParagraphs 
          ? 'Paste or type items separated by blank lines'
          : 'Paste or type items, one per line'"
        class="w-full px-4 py-3 text-sm transition-colors border rounded-md resize-none bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        :style="{ height: textareaHeight }"
      />
      <div class="flex gap-2">
        <button
          @click="addBulkItems"
          type="button"
          :disabled="!bulkText.trim()"
          class="px-4 py-2 text-sm font-medium transition-colors border rounded-md bg-blue-600 border-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add items
        </button>
        <button
          @click="closeBulkMode"
          type="button"
          class="px-4 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:border-neutral-600"
        >
          {{ isEmpty || bulkText.trim() ? 'Cancel' : 'Hide' }}
        </button>
      </div>
    </div>

    <!-- List Edit Mode -->
    <div v-else class="space-y-3">
      <div class="mb-2">
        <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">
          List Items ({{ items.length }})
        </label>
      </div>
      <div
        v-for="(item, index) in items"
        :key="index"
        class="flex items-center gap-2"
      >
        <input
          :value="item"
          @input="updateItem(index, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="handleEnter(index)"
          type="text"
          placeholder="List item"
          class="list-editor-input flex-1 px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
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
      <div class="flex gap-2">
        <button
          @click="addItem"
          type="button"
          class="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:border-neutral-600"
        >
          <Plus class="w-4 h-4" />
          Add Item
        </button>
        <button
          @click="openBulkMode"
          type="button"
          class="px-3 py-2 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-neutral-100 hover:border-neutral-600"
        >
          Bulk Add
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { X, Plus } from 'lucide-vue-next'
import type { ListContent } from '@app/api'

const props = defineProps<{
  content: ListContent
}>()

const emit = defineEmits<{
  update: [items: string[]]
}>()

const items = computed(() => props.content.items)
const bulkText = ref('')
const splitByParagraphs = ref(false)

// Check if list is empty (no items or only empty strings)
const isEmpty = computed(() => 
  items.value.length === 0 || items.value.every(item => !item.trim())
)

// Show bulk mode by default for empty lists, or when explicitly opened
const showBulkMode = ref(isEmpty.value)

// Count items from bulk text
const itemCount = computed(() => {
  if (!bulkText.value.trim()) return 0
  
  const separator = splitByParagraphs.value ? /\n\n+/ : /\n/
  return bulkText.value
    .split(separator)
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .length
})

// Dynamic textarea height
const textareaHeight = computed(() => {
  const lines = bulkText.value.split('\n').length
  const height = Math.min(Math.max(120, lines * 24), 400)
  return `${height}px`
})

// Parse and add bulk items
const addBulkItems = () => {
  const separator = splitByParagraphs.value ? /\n\n+/ : /\n/
  const newItems = bulkText.value
    .split(separator)
    .map(item => item.trim())
    .filter(item => item.length > 0)
  
  // Append to existing non-empty items or replace if empty
  const existingItems = isEmpty.value ? [] : items.value.filter(item => item.trim())
  emit('update', [...existingItems, ...newItems])
  
  // Reset bulk mode
  bulkText.value = ''
  splitByParagraphs.value = false
  showBulkMode.value = false
}

// Mode management
const openBulkMode = () => {
  bulkText.value = ''
  showBulkMode.value = true
}

const closeBulkMode = () => {
  bulkText.value = ''
  splitByParagraphs.value = false
  showBulkMode.value = isEmpty.value // Keep open for empty lists
}

// Individual item management
const updateItem = (index: number, value: string) => {
  const newItems = [...items.value]
  newItems[index] = value
  emit('update', newItems)
}

const addItem = () => {
  emit('update', [...items.value, ''])
}

const removeItem = (index: number) => {
  emit('update', items.value.filter((_, i) => i !== index))
}

const handleEnter = async (index: number) => {
  if (items.value[index].trim()) {
    const newItems = [...items.value]
    newItems.splice(index + 1, 0, '')
    emit('update', newItems)
    
    // Focus new input after DOM update
    await nextTick()
    const inputs = document.querySelectorAll<HTMLInputElement>('.list-editor-input')
    inputs[index + 1]?.focus()
  }
}

// Reset to bulk mode when list becomes empty
watch(isEmpty, (nowEmpty) => {
  if (nowEmpty) {
    showBulkMode.value = true
  }
})
</script>