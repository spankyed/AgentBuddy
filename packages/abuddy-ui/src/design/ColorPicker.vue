<template>
  <div ref="rootRef" class="relative inline-block">
    <button
      type="button"
      class="border border-neutral-700 hover:border-neutral-600 transition-colors rounded-md"
      :class="triggerClass"
      :style="{ backgroundColor: modelValue || 'transparent' }"
      :title="title"
      @click.stop="open = !open"
    />
    <div
      v-if="open"
      class="absolute z-20 top-full mt-2 left-0 bg-neutral-800 border border-neutral-700 rounded-lg p-2 w-max grid grid-cols-5 gap-1"
    >
      <button
        v-for="c in colors"
        :key="c"
        type="button"
        class="w-7 h-7 rounded hover:scale-110 transition-transform"
        :style="{ backgroundColor: c }"
        @click="select(c)"
      />
      <button
        v-if="allowClear && modelValue"
        type="button"
        class="col-span-5 mt-1 flex items-center justify-center gap-1.5 py-1 text-xs whitespace-nowrap text-neutral-400 hover:text-white rounded hover:bg-neutral-700 transition-colors"
        @click="clear"
      >
        <X :size="12" />
        Clear
      </button>
    </div>
  </div>
</template>

<script lang="ts">
export const DEFAULT_COLORS = [
  '#6B7280', // Gray
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#84CC16', // Lime
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#78716C', // Stone
]
</script>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { X } from 'lucide-vue-next'

withDefaults(defineProps<{
  modelValue?: string | null
  colors?: string[]
  allowClear?: boolean
  triggerClass?: string
  title?: string
}>(), {
  modelValue: null,
  colors: () => DEFAULT_COLORS,
  allowClear: false,
  triggerClass: 'w-8 h-8',
  title: 'Change color',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  change: [value: string | null]
}>()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)

function select(c: string) {
  emit('update:modelValue', c)
  emit('change', c)
  open.value = false
}

function clear() {
  emit('update:modelValue', null)
  emit('change', null)
  open.value = false
}

function onDocMousedown(e: MouseEvent) {
  if (!open.value) return
  const root = rootRef.value
  if (!root) return
  if (!root.contains(e.target as Node)) open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMousedown)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  document.removeEventListener('keydown', onKeydown)
})
</script>
