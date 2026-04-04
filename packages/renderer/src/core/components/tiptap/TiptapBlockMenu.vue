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
import { NodeSelection } from '@tiptap/pm/state'
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

const buttonVisible = ref(false)
const buttonTop = ref(0)
const hoveredBlockEl = ref<HTMLElement | null>(null)
const dropIndicatorTop = ref<number | null>(null)
let dragState: { pos: number; node: any } | null = null

function getBlockNodeAt(blockEl: HTMLElement) {
  const pos = props.editor.view.posAtDOM(blockEl, 0)
  const $pos = props.editor.state.doc.resolve(pos)
  const topPos = $pos.before(1)
  return { pos: topPos, node: props.editor.state.doc.nodeAt(topPos)! }
}

function onDragHandleMouseDown() {
  if (!hoveredBlockEl.value) return
  const { pos } = getBlockNodeAt(hoveredBlockEl.value)
  try {
    const tr = props.editor.state.tr.setSelection(NodeSelection.create(props.editor.state.doc, pos))
    props.editor.view.dispatch(tr)
  } catch { /* node type doesn't support NodeSelection */ }
}

function onDragHandleMouseUp() {
  props.editor.view.focus()
}

function onDragStart(event: DragEvent) {
  if (!hoveredBlockEl.value || !event.dataTransfer) return
  dragState = getBlockNodeAt(hoveredBlockEl.value)
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-block-drag', '')
  event.dataTransfer.setDragImage(hoveredBlockEl.value, 0, 0)
}

function onDragEnd() {
  dropIndicatorTop.value = null
  dragState = null
}

function getDropBoundary(clientY: number): { indicatorY: number; insertPos: number } {
  const editor = props.editor
  const editorDom = editor.view.dom as HTMLElement
  const wrapper = editorDom.closest('.tiptap-editor') as HTMLElement
  const wrapperTop = wrapper?.getBoundingClientRect().top ?? 0
  const children = Array.from(editorDom.children) as HTMLElement[]

  for (const child of children) {
    const r = child.getBoundingClientRect()
    if (clientY < (r.top + r.bottom) / 2) {
      const pos = editor.view.posAtDOM(child, 0)
      const insertPos = editor.state.doc.resolve(pos).before(1)
      return { indicatorY: r.top - wrapperTop, insertPos }
    }
  }
  return { indicatorY: (children.at(-1)?.getBoundingClientRect().bottom ?? 0) - wrapperTop, insertPos: editor.state.doc.content.size }
}

function onEditorDragOver(event: DragEvent) {
  if (!dragState) return
  event.preventDefault()
  event.stopPropagation()
  dropIndicatorTop.value = getDropBoundary(event.clientY).indicatorY
}

function onEditorDrop(event: DragEvent) {
  if (!dragState) return
  event.preventDefault()
  event.stopPropagation()

  const { pos: sourcePos, node } = dragState
  const { insertPos } = getDropBoundary(event.clientY)

  let tr = props.editor.state.tr.delete(sourcePos, sourcePos + node.nodeSize)
  const mapped = Math.min(tr.mapping.map(insertPos), tr.doc.content.size)
  tr = tr.insert(mapped, node)
  props.editor.view.dispatch(tr)

  dropIndicatorTop.value = null
  dragState = null
}

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
  // Fallback for atom nodes (e.g. subdocument links): find nearest child by vertical position
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
  if (!props.editor.state.selection.empty) return

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
  document.addEventListener('dragover', onEditorDragOver, true)
  document.addEventListener('drop', onEditorDrop, true)
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
  props.editor.on('transaction', onTransaction)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
  props.editor.off('transaction', onTransaction)
  document.removeEventListener('dragover', onEditorDragOver, true)
  document.removeEventListener('drop', onEditorDrop, true)
  if (props.editor.isDestroyed) return
  const editorDom = props.editor.view.dom as HTMLElement
  editorDom.removeEventListener('mousemove', onEditorMouseMove)
  editorDom.removeEventListener('mouseleave', onEditorMouseLeave)
})
</script>
