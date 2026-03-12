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
  </div>

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
  ChevronDown,
} from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()

const open = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const plusBtnRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)
const dropdownStyle = reactive({ top: '0px', left: '0px' })

const buttonVisible = ref(false)
const buttonTop = ref(0)
const hoveredBlockEl = ref<HTMLElement | null>(null)
function walkToDirectChild(node: HTMLElement | null, parent: HTMLElement): HTMLElement | null {
  while (node && node.parentElement !== parent) node = node.parentElement
  return node?.parentElement === parent ? node : null
}

function resolveBlock(node: Node, editorDom: HTMLElement): HTMLElement | null {
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node) as HTMLElement
  return walkToDirectChild(el, editorDom)
}

function updateButtonPosition(block: HTMLElement) {
  const wrapper = (props.editor.view.dom as HTMLElement).closest('.tiptap-editor') as HTMLElement
  if (wrapper) {
    buttonTop.value = block.getBoundingClientRect().top - wrapper.getBoundingClientRect().top
  }
}

function findBlockFromGutter(editorDom: HTMLElement, event: MouseEvent): HTMLElement | null {
  const rect = editorDom.getBoundingClientRect()
  const contentX = rect.left + (parseFloat(getComputedStyle(editorDom).paddingLeft) || 0) + 4
  const pos = props.editor.view.posAtCoords({ left: contentX, top: event.clientY })
  if (pos) {
    const block = resolveBlock(props.editor.view.domAtPos(pos.pos).node, editorDom)
    if (block) return block
  }
  // Fallback for atom nodes (e.g. subpage links): find nearest child by vertical position
  let closest: HTMLElement | null = null
  let closestDist = Infinity
  for (const child of editorDom.children) {
    const r = child.getBoundingClientRect()
    if (event.clientY >= r.top && event.clientY <= r.bottom) return child as HTMLElement
    const dist = Math.min(Math.abs(event.clientY - r.top), Math.abs(event.clientY - r.bottom))
    if (dist < closestDist) { closestDist = dist; closest = child as HTMLElement }
  }
  return closest
}

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

function onEditorMouseMove(event: MouseEvent) {
  if (open.value) return

  const editorDom = props.editor.view.dom as HTMLElement
  const block = walkToDirectChild(event.target as HTMLElement, editorDom) ?? findBlockFromGutter(editorDom, event)

  if (!block) {
    buttonVisible.value = false
    return
  }

  hoveredBlockEl.value = block
  buttonVisible.value = true
  updateButtonPosition(block)
}

function onEditorMouseLeave() {
  if (!open.value) buttonVisible.value = false
}

watch(open, async (isOpen) => {
  if (isOpen && plusBtnRef.value) {
    await nextTick()
    const rect = plusBtnRef.value.getBoundingClientRect()
    dropdownStyle.top = `${rect.bottom + 4}px`
    dropdownStyle.left = `${rect.left}px`
  }
  if (!isOpen) {
    buttonVisible.value = false
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
  if (event.key === 'Escape' && open.value) {
    open.value = false
  }
}

function onTransaction({ transaction }: { transaction: any }) {
  if (transaction.docChanged) {
    open.value = false
    buttonVisible.value = false
  }
}

onMounted(() => {
  const editorDom = props.editor.view.dom as HTMLElement
  editorDom.addEventListener('mousemove', onEditorMouseMove)
  editorDom.addEventListener('mouseleave', onEditorMouseLeave)
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
  props.editor.on('transaction', onTransaction)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
  props.editor.off('transaction', onTransaction)
  if (props.editor.isDestroyed) return
  const editorDom = props.editor.view.dom as HTMLElement
  editorDom.removeEventListener('mousemove', onEditorMouseMove)
  editorDom.removeEventListener('mouseleave', onEditorMouseLeave)
})
</script>
