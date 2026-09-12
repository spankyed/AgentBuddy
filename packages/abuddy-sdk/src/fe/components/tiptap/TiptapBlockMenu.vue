<template>
  <div
    ref="handleRef"
    class="block-handle"
    :class="{ 'is-visible': buttonVisible }"
    :style="{ top: buttonTop + 'px' }"
    @mouseenter="buttonVisible = true"
    @mouseleave="buttonVisible = !open"
  >
    <button
      ref="plusBtnRef"
      type="button"
      class="plus-btn flex items-center justify-center w-5 h-5 text-neutral-500 hover:text-neutral-300 transition-colors"
      @click.stop="onPlusClick"
    >
      <Plus :size="15" />
    </button>
    <button
      type="button"
      class="drag-btn flex items-center justify-center w-5 h-5 text-neutral-500 hover:text-neutral-300 transition-colors"
      draggable="true"
      @mousedown.stop="onDragHandleMouseDown"
      @mouseup="onDragHandleMouseUp"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
    >
      <GripVertical :size="15" />
    </button>
  </div>

  <!-- Drop indicator line -->
  <div v-if="dropIndicatorTop !== null" class="block-drop-indicator" :style="{ top: dropIndicatorTop + 'px' }" />

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
import type { Editor } from '@tiptap/vue-3'
import { useBlockHandle } from './composables/useBlockHandle'
import {
  Plus,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeSquare,
  Minus,
  ChevronDown,
  Hash,
} from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()

const open = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const plusBtnRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)
const dropdownStyle = reactive({ top: '0px', left: '0px' })

const {
  buttonVisible,
  buttonTop,
  hoveredBlockEl,
  dropIndicatorTop,
  resolveBlock,
  updateButtonPosition,
  onDragHandleMouseDown,
  onDragHandleMouseUp,
  onDragStart,
  onDragEnd,
  mount,
} = useBlockHandle(() => props.editor)

function onPlusClick() {
  if (open.value) { open.value = false; return }
  if (!hoveredBlockEl.value) return

  const editor = props.editor
  const pos = editor.view.posAtDOM(hoveredBlockEl.value, 0)
  const $pos = editor.state.doc.resolve(pos)
  const node = $pos.nodeAfter

  if (!node?.isAtom && !$pos.parent.textContent.trim()) {
    editor.chain().focus().setTextSelection(pos).run()
    open.value = true
    return
  }

  const insertPos = node?.isAtom ? pos + node.nodeSize : $pos.end($pos.depth) + 1
  editor.chain().focus().insertContentAt(insertPos, { type: 'paragraph' }).run()
  nextTick(() => {
    const editorDom = editor.view.dom as HTMLElement
    const block = resolveBlock(editor.view.domAtPos(editor.state.selection.from).node, editorDom)
    if (block) {
      hoveredBlockEl.value = block
      updateButtonPosition(block)
    }
    open.value = true
  })
}

watch(open, async (isOpen) => {
  if (isOpen && plusBtnRef.value) {
    await nextTick()
    const rect = plusBtnRef.value.getBoundingClientRect()
    dropdownStyle.top = `${rect.bottom + 4}px`
    dropdownStyle.left = `${rect.left}px`
  }
  if (!isOpen) buttonVisible.value = false
})

const extraItems = inject(EXTRA_BLOCK_ITEMS_KEY, [])

const blockItems: BlockItem[] = [
  { label: 'Reference', icon: Hash, command: e => e.chain().focus().command(({ tr, dispatch }) => {
  if (dispatch) tr.insertText('#')
  return true
}).run() },
  { label: 'Heading 1', icon: Heading1, command: e => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', icon: Heading2, command: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', icon: Heading3, command: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Bulleted List', icon: List, command: e => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered List', icon: ListOrdered, command: e => e.chain().focus().toggleOrderedList().run() },
  { label: 'Checklist', icon: ListChecks, command: e => e.chain().focus().toggleTaskList().run() },
  { label: 'Quote', icon: Quote, command: e => e.chain().focus().toggleBlockquote().run() },
  { label: 'Code Block', icon: CodeSquare, command: e => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Horizontal Line', icon: Minus, command: e => e.chain().focus().setHorizontalRule().run() },
  { label: 'Details', icon: ChevronDown, command: e => e.chain().focus().setDetails().run() },
]

const allItems = computed(() => [...extraItems, ...blockItems])

function runCommand(command: (e: Editor) => void) {
  if (hoveredBlockEl.value) {
    const pos = props.editor.view.posAtDOM(hoveredBlockEl.value, 0)
    props.editor.chain().focus().setTextSelection(pos).run()
  }
  command(props.editor)
  open.value = false
}

function onClickOutside(event: MouseEvent) {
  if (open.value && dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) open.value = false
}

function onTransaction({ transaction }: { transaction: any }) {
  if (transaction.docChanged) {
    open.value = false
    buttonVisible.value = false
  }
}

let unmountHandle: (() => void) | null = null

onMounted(() => {
  unmountHandle = mount(() => open.value)
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
  props.editor.on('transaction', onTransaction)
})

onBeforeUnmount(() => {
  unmountHandle?.()
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
  props.editor.off('transaction', onTransaction)
})
</script>
