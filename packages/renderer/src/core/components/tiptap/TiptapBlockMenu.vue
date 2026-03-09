<template>
  <FloatingMenu
    v-if="editor"
    :editor="editor"
    :tippy-options="{ placement: 'left-start', offset: [0, 8] }"
    class="block-menu"
  >
    <div class="relative">
      <button
        type="button"
        class="plus-btn flex items-center justify-center w-7 h-7 rounded hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300 transition-colors"
        @click.stop="open = !open"
      >
        <Plus :size="18" />
      </button>

      <div
        v-if="open"
        ref="dropdownRef"
        class="absolute left-0 top-8 z-50 w-52 py-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg"
      >
        <button
          v-for="item in blockItems"
          :key="item.label"
          type="button"
          class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
          @click="runCommand(item.command)"
        >
          <component :is="item.icon" :size="16" class="text-neutral-400" />
          {{ item.label }}
        </button>
      </div>
    </div>
  </FloatingMenu>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { FloatingMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/vue-3'
import {
  Plus,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeSquare,
  Minus,
} from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()

const open = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

interface BlockItem {
  label: string
  icon: typeof Plus
  command: (e: Editor) => void
}

const blockItems: BlockItem[] = [
  { label: 'Heading 1', icon: Heading1, command: e => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', icon: Heading2, command: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', icon: Heading3, command: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Bulleted List', icon: List, command: e => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered List', icon: ListOrdered, command: e => e.chain().focus().toggleOrderedList().run() },
  { label: 'Task List', icon: ListChecks, command: e => e.chain().focus().toggleTaskList().run() },
  { label: 'Quote', icon: Quote, command: e => e.chain().focus().toggleBlockquote().run() },
  { label: 'Code Block', icon: CodeSquare, command: e => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Horizontal Line', icon: Minus, command: e => e.chain().focus().setHorizontalRule().run() },
]

function runCommand(command: (e: Editor) => void) {
  command(props.editor)
  open.value = false
}

function onClickOutside(event: MouseEvent) {
  if (open.value && dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})
</script>
