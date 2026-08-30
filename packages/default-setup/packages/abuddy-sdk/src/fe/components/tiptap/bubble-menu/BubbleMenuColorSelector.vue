<template>
  <div class="relative" ref="wrapperRef">
    <button
      type="button"
      class="flex items-center gap-1 px-2 py-1 text-sm hover:bg-neutral-700 rounded transition-colors"
      :style="{ color: currentColor }"
      @click="open = !open"
    >
      <span class="font-semibold text-base leading-none">A</span>
      <ChevronDown :size="12" class="text-neutral-500" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-full mt-1 w-48 py-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-50 animation-bubble-in"
    >
      <!-- Text color section -->
      <div class="px-3 mb-1 text-xs font-medium text-neutral-500 uppercase tracking-wide">Color</div>
      <div class="flex flex-wrap gap-1 px-3 pb-2">
        <button
          v-for="c in textColors"
          :key="'c-' + c.name"
          type="button"
          class="w-6 h-6 rounded-full border border-neutral-600 hover:border-neutral-400 transition-colors flex items-center justify-center"
          :style="{ backgroundColor: c.value === null ? 'transparent' : c.value }"
          :title="c.name"
          @click="setTextColor(c.value)"
        >
          <Check v-if="isActiveColor(c.value)" :size="12" class="text-white drop-shadow-sm" />
          <span v-if="c.value === null" class="text-[10px] text-neutral-400">✕</span>
        </button>
      </div>

      <!-- Highlight section -->
      <div class="px-3 mb-1 text-xs font-medium text-neutral-500 uppercase tracking-wide">Background</div>
      <div class="flex flex-wrap gap-1 px-3">
        <button
          v-for="c in highlightColors"
          :key="'h-' + c.name"
          type="button"
          class="w-6 h-6 rounded-full border border-neutral-600 hover:border-neutral-400 transition-colors flex items-center justify-center"
          :style="{ backgroundColor: c.value === null ? 'transparent' : c.value }"
          :title="c.name"
          @click="setHighlight(c.value)"
        >
          <Check v-if="isActiveHighlight(c.value)" :size="12" class="text-white drop-shadow-sm" />
          <span v-if="c.value === null" class="text-[10px] text-neutral-400">✕</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { ChevronDown, Check } from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()

const open = ref(false)
const wrapperRef = ref<HTMLElement>()

const textColors = [
  { name: 'Default', value: null },
  { name: 'Purple', value: '#c084fc' },
  { name: 'Red', value: '#f87171' },
  { name: 'Yellow', value: '#fbbf24' },
  { name: 'Blue', value: '#60a5fa' },
  { name: 'Green', value: '#4ade80' },
  { name: 'Orange', value: '#fb923c' },
  { name: 'Pink', value: '#f472b6' },
  { name: 'Gray', value: '#a3a3a3' },
]

const highlightColors = [
  { name: 'None', value: null },
  { name: 'Purple', value: 'rgba(192,132,252,0.25)' },
  { name: 'Red', value: 'rgba(248,113,113,0.25)' },
  { name: 'Yellow', value: 'rgba(251,191,36,0.25)' },
  { name: 'Blue', value: 'rgba(96,165,250,0.25)' },
  { name: 'Green', value: 'rgba(74,222,128,0.25)' },
  { name: 'Orange', value: 'rgba(251,146,60,0.25)' },
  { name: 'Pink', value: 'rgba(244,114,182,0.25)' },
  { name: 'Gray', value: 'rgba(163,163,163,0.2)' },
]

const currentColor = computed(() => {
  return props.editor.getAttributes('textStyle').color || '#f5f5f5'
})

function isActiveColor(value: string | null) {
  if (value === null) return !props.editor.getAttributes('textStyle').color
  return props.editor.getAttributes('textStyle').color === value
}

function isActiveHighlight(value: string | null) {
  if (value === null) return !props.editor.isActive('highlight')
  return props.editor.isActive('highlight', { color: value })
}

function setTextColor(value: string | null) {
  if (value === null) {
    props.editor.chain().focus().unsetColor().run()
  } else {
    props.editor.chain().focus().setColor(value).run()
  }
  open.value = false
}

function setHighlight(value: string | null) {
  if (value === null) {
    props.editor.chain().focus().unsetHighlight().run()
  } else {
    props.editor.chain().focus().setHighlight({ color: value }).run()
  }
  open.value = false
}

function onClickOutside(event: MouseEvent) {
  if (open.value && wrapperRef.value && !wrapperRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>
