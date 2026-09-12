<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :options="menuOptions"
    :append-to="appendTarget"
    :should-show="({ editor: e }) => e.isActive('image')"
    class="!z-[9999] flex flex-col bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg"
  >
    <div class="flex items-center gap-0.5 px-1.5 py-1">
      <button
        type="button"
        class="p-1.5 rounded hover:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-200"
        title="View image"
        @click="viewImage"
      >
        <Eye :size="15" />
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-200"
        title="Copy image"
        @click="copyImage"
      >
        <Clipboard :size="15" />
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-200"
        :class="{ 'bg-neutral-600 text-neutral-100': resizeVisible }"
        title="Resize image"
        @click="toggleResize"
      >
        <Maximize2 :size="15" />
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-neutral-600 transition-colors text-neutral-400 hover:text-red-400"
        title="Delete image"
        @click="deleteImage"
      >
        <Trash2 :size="15" />
      </button>
    </div>
    <div v-if="resizeVisible" class="flex items-center gap-2 px-2 py-1.5 border-t border-neutral-700">
      <input
        type="range"
        min="25"
        max="100"
        step="5"
        :value="imageWidth"
        class="flex-1 accent-blue-400"
        @input="previewResize(($event.target as HTMLInputElement).valueAsNumber)"
        @change="commitResize(($event.target as HTMLInputElement).valueAsNumber)"
      />
      <span class="text-xs text-neutral-400 w-8">{{ imageWidth }}%</span>
    </div>
  </BubbleMenu>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/vue-3'
import { Eye, Clipboard, Maximize2, Trash2 } from 'lucide-vue-next'
import { NodeSelection } from '@tiptap/pm/state'
import { getWidthFromSrc, setSrcWidth } from './resizable-image'

const props = defineProps<{ editor: Editor }>()

const emit = defineEmits<{
  (e: 'viewImage', src: string): void
}>()

const appendTarget = () => document.body

function getScrollParent(el: HTMLElement | null): HTMLElement | Window {
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') return el
    el = el.parentElement
  }
  return window
}

const menuOptions = {
  placement: 'top' as const,
  offset: 8,
  strategy: 'fixed' as const,
  scrollTarget: getScrollParent(props.editor.view.dom),
}

const resizeVisible = ref(false)
const imageWidth = ref(100)

function getSelectedImageAttrs() {
  const { node } = props.editor.state.selection as any
  if (node?.type.name === 'image') return node.attrs
  return null
}

function syncWidth() {
  const attrs = getSelectedImageAttrs()
  if (attrs) {
    imageWidth.value = getWidthFromSrc(attrs.src) ?? 100
  }
  resizeVisible.value = false
}

onMounted(() => {
  props.editor.on('selectionUpdate', syncWidth)
})

onBeforeUnmount(() => {
  props.editor.off('selectionUpdate', syncWidth)
})

function viewImage() {
  const attrs = getSelectedImageAttrs()
  if (attrs?.src) emit('viewImage', attrs.src)
}

async function copyImage() {
  const attrs = getSelectedImageAttrs()
  if (!attrs?.src) return
  try {
    const response = await fetch(attrs.src)
    const blob = await response.blob()
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ])
  } catch (err) {
    console.error('Failed to copy image:', err)
  }
}

function deleteImage() {
  props.editor.chain().focus().deleteSelection().run()
}

function toggleResize() {
  resizeVisible.value = !resizeVisible.value
  if (resizeVisible.value) {
    const attrs = getSelectedImageAttrs()
    if (attrs) {
      imageWidth.value = getWidthFromSrc(attrs.src) ?? 100
    }
  }
}

function getSelectedImageDOM(): HTMLImageElement | null {
  const selection = props.editor.state.selection
  if (selection instanceof NodeSelection) {
    const dom = props.editor.view.nodeDOM(selection.from)
    return dom instanceof HTMLImageElement ? dom : null
  }
  return null
}

function previewResize(pct: number) {
  imageWidth.value = pct
  const imgEl = getSelectedImageDOM()
  if (imgEl) {
    imgEl.style.width = pct + '%'
  }
}

function commitResize(pct: number) {
  imageWidth.value = pct
  const attrs = getSelectedImageAttrs()
  if (!attrs?.src) return
  const newSrc = setSrcWidth(attrs.src, pct)
  props.editor.chain().focus().updateAttributes('image', { src: newSrc }).run()
}
</script>
