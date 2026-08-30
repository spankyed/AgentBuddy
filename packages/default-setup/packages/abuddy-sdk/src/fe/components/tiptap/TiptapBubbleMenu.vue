<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :options="{ placement: 'top', offset: 8, strategy: 'absolute', inline: true }"
    :should-show="shouldShow"
    class="bubble-menu flex flex-col bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg"
  >
    <div class="flex items-center">
      <BubbleMenuNodeSelector v-if="hasHeadings" :editor="editor" />
      <div v-if="hasHeadings" class="w-px self-stretch bg-neutral-700" />
      <BubbleMenuToolbar :editor="editor" @toggle-link="linkInput?.show()" />
      <template v-if="hasColors">
        <div class="w-px self-stretch bg-neutral-700" />
        <BubbleMenuColorSelector :editor="editor" />
      </template>
    </div>
    <BubbleMenuLinkInput ref="linkInput" :editor="editor" />
  </BubbleMenu>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/vue-3'
import BubbleMenuNodeSelector from './bubble-menu/BubbleMenuNodeSelector.vue'
import BubbleMenuToolbar from './bubble-menu/BubbleMenuToolbar.vue'
import BubbleMenuColorSelector from './bubble-menu/BubbleMenuColorSelector.vue'
import BubbleMenuLinkInput from './bubble-menu/BubbleMenuLinkInput.vue'

const props = defineProps<{ editor: Editor }>()

const linkInput = ref<InstanceType<typeof BubbleMenuLinkInput>>()

let rightClicked = false

function onContextMenu() { rightClicked = true }
function onMouseDown() { rightClicked = false }

onMounted(() => {
  const el = props.editor.view.dom
  el.addEventListener('contextmenu', onContextMenu)
  el.addEventListener('mousedown', onMouseDown)
})

onBeforeUnmount(() => {
  if (props.editor.isDestroyed) return
  const el = props.editor.view.dom
  el.removeEventListener('contextmenu', onContextMenu)
  el.removeEventListener('mousedown', onMouseDown)
})

const atomicNodes = ['image', 'subDocumentLink', 'reference']

const hasHeadings = computed(() => {
  return props.editor.extensionManager.extensions.some(ext => ext.name === 'heading')
})

const hasColors = computed(() => {
  return props.editor.extensionManager.extensions.some(ext => ext.name === 'color')
})

function shouldShow(props: Record<string, any>) {
  if (rightClicked) return false
  if (props.state.selection.empty) return false
  if (props.editor.isEmpty) return false
  return !atomicNodes.some(node => props.editor.isActive(node))
}
</script>
