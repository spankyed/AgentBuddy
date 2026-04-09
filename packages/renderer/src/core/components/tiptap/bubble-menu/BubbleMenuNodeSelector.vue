<template>
  <div class="relative" ref="wrapperRef">
    <button
      type="button"
      class="flex items-center gap-1 px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors whitespace-nowrap"
      @click="open = !open"
    >
      {{ activeLabel }}
      <ChevronDown :size="12" class="text-neutral-500" />
    </button>

    <div
      v-if="open"
      class="absolute left-0 top-full mt-1 w-44 py-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-50 animation-bubble-in"
    >
      <button
        v-for="item in nodeTypes"
        :key="item.name"
        type="button"
        class="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700 transition-colors"
        @click="runCommand(item)"
      >
        <component :is="item.icon" :size="15" class="text-neutral-400" />
        <span class="flex-1 text-left">{{ item.label }}</span>
        <Check v-if="item.isActive()" :size="14" class="text-blue-400" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import {
  ChevronDown,
  Check,
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeSquare,
} from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()

const open = ref(false)
const wrapperRef = ref<HTMLElement>()

const nodeTypes = computed(() => {
  const e = props.editor
  return [
    { name: 'paragraph', label: 'Text', icon: Pilcrow, isActive: () => e.isActive('paragraph') && !e.isActive('bulletList') && !e.isActive('orderedList') && !e.isActive('taskList') && !e.isActive('blockquote') && !e.isActive('codeBlock'), command: () => e.chain().focus().setParagraph().run() },
    { name: 'heading1', label: 'Heading 1', icon: Heading1, isActive: () => e.isActive('heading', { level: 1 }), command: () => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { name: 'heading2', label: 'Heading 2', icon: Heading2, isActive: () => e.isActive('heading', { level: 2 }), command: () => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { name: 'heading3', label: 'Heading 3', icon: Heading3, isActive: () => e.isActive('heading', { level: 3 }), command: () => e.chain().focus().toggleHeading({ level: 3 }).run() },
    { name: 'bulletList', label: 'Bullet List', icon: List, isActive: () => e.isActive('bulletList'), command: () => e.chain().focus().toggleBulletList().run() },
    { name: 'orderedList', label: 'Numbered List', icon: ListOrdered, isActive: () => e.isActive('orderedList'), command: () => e.chain().focus().toggleOrderedList().run() },
    { name: 'taskList', label: 'To-Do List', icon: ListChecks, isActive: () => e.isActive('taskList'), command: () => e.chain().focus().toggleTaskList().run() },
    { name: 'blockquote', label: 'Quote', icon: Quote, isActive: () => e.isActive('blockquote'), command: () => e.chain().focus().toggleBlockquote().run() },
    { name: 'codeBlock', label: 'Code Block', icon: CodeSquare, isActive: () => e.isActive('codeBlock'), command: () => e.chain().focus().toggleCodeBlock().run() },
  ]
})

const activeLabel = computed(() => {
  const active = nodeTypes.value.find(t => t.isActive())
  return active?.label ?? 'Multiple'
})

function runCommand(item: { command: () => void }) {
  item.command()
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
