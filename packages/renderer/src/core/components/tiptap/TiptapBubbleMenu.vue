<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :options="{ placement: 'top', offset: 8, strategy: 'absolute', inline: true }"
    :should-show="shouldShow"
    class="bubble-menu flex flex-col bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg"
  >
    <BubbleMenuToolbar :editor="editor" @toggle-link="linkInput?.show()" />
    <BubbleMenuLinkInput ref="linkInput" :editor="editor" />
  </BubbleMenu>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/vue-3'
import BubbleMenuToolbar from './bubble-menu/BubbleMenuToolbar.vue'
import BubbleMenuLinkInput from './bubble-menu/BubbleMenuLinkInput.vue'

defineProps<{ editor: Editor }>()

const linkInput = ref<InstanceType<typeof BubbleMenuLinkInput>>()

const atomicNodes = ['image', 'subDocumentLink', 'reference']

function shouldShow(props: Record<string, any>) {
  if (props.state.selection.empty) return false
  if (props.editor.isEmpty) return false
  return !atomicNodes.some(node => props.editor.isActive(node))
}
</script>
