<template>
  <FloatingMenu
    v-if="editor"
    :editor="editor"
    :options="{ placement: 'left', offset: { mainAxis: 4 }, strategy: 'absolute' }"
    class="block-menu"
  >
    <div class="relative">
      <button
        ref="plusBtnRef"
        type="button"
        class="plus-btn flex items-center justify-center w-5 h-5 text-neutral-500 hover:text-neutral-300 transition-colors"
        @click.stop="open = !open"
      >
        <Plus :size="15" />
      </button>
    </div>
  </FloatingMenu>

  <Teleport to="body">
    <div
      v-if="open"
      ref="dropdownRef"
      class="fixed z-50 w-52 py-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg"
      :style="dropdownStyle"
    >
      <button
        v-for="item in allItems"
        :key="item.label"
        type="button"
        class="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
        @click="runCommand(item.command)"
      >
        <component :is="item.icon" :size="16" class="text-neutral-400" />
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, inject, onMounted, onBeforeUnmount } from 'vue'
import { EXTRA_BLOCK_ITEMS_KEY, type BlockItem } from './injection-keys'
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
const plusBtnRef = ref<HTMLElement | null>(null)
const dropdownStyle = reactive({ top: '0px', left: '0px' })

watch(open, async (isOpen) => {
  if (isOpen && plusBtnRef.value) {
    await nextTick()
    const rect = plusBtnRef.value.getBoundingClientRect()
    dropdownStyle.top = `${rect.bottom + 4}px`
    dropdownStyle.left = `${rect.left}px`
  }
})

const extraItems = inject(EXTRA_BLOCK_ITEMS_KEY, [])

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

const allItems = computed(() => [...blockItems, ...extraItems])

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
