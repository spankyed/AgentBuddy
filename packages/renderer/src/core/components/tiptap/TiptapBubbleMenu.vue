<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :options="{ placement: 'top', offset: 8, strategy: 'absolute' }"
    :should-show="({ state, editor: e }) => !state.selection.empty && !e.isActive('image') && !e.isActive('subDocumentLink')"
    class="bubble-menu flex flex-col bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg"
  >
    <div class="flex items-center gap-0.5 px-1.5 py-1">
      <button
        v-for="item in items"
        :key="item.action"
        type="button"
        class="p-1.5 rounded hover:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-200"
        :class="{ 'bg-neutral-600 text-neutral-100': item.isActive?.() }"
        :title="item.title"
        @click="item.command"
      >
        <component :is="item.icon" :size="15" />
      </button>
    </div>
    <div v-if="linkInputVisible" class="flex items-center gap-1.5 px-1.5 py-1 border-t border-neutral-700">
      <input
        ref="linkInputRef"
        v-model="linkUrl"
        type="url"
        class="w-56 px-2 py-1 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
        placeholder="Enter URL"
        @keydown.enter="applyLink"
        @keydown.escape="cancelLink"
      />
      <button @click="applyLink" class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded">
        Apply
      </button>
      <button v-if="hasExistingLink" @click="removeLink" class="p-1 text-neutral-400 hover:text-red-400 transition-colors" title="Remove link">
        <X :size="14" />
      </button>
    </div>
  </BubbleMenu>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/vue-3'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  X,
} from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()

const linkInputVisible = ref(false)
const linkUrl = ref('')
const linkInputRef = ref<HTMLInputElement>()
const hasExistingLink = ref(false)

function resetLinkInput() {
  linkInputVisible.value = false
  linkUrl.value = ''
}

onMounted(() => {
  props.editor.on('selectionUpdate', resetLinkInput)
})

onBeforeUnmount(() => {
  props.editor.off('selectionUpdate', resetLinkInput)
})

function showLinkInput() {
  const existing = props.editor.getAttributes('link').href
  linkUrl.value = existing || ''
  hasExistingLink.value = !!existing
  linkInputVisible.value = true
  nextTick(() => linkInputRef.value?.focus())
}

function applyLink() {
  const url = linkUrl.value.trim()
  if (!url) {
    linkInputVisible.value = false
    linkUrl.value = ''
    return
  }

  props.editor.chain().focus().setLink({ href: url }).run()

  linkInputVisible.value = false
  linkUrl.value = ''
}

function removeLink() {
  props.editor.chain().focus().unsetLink().run()
  linkInputVisible.value = false
  linkUrl.value = ''
}

function cancelLink() {
  linkInputVisible.value = false
  linkUrl.value = ''
  props.editor.chain().focus().run()
}

const items = computed(() => {
  const e = props.editor
  if (!e) return []

  return [
    {
      action: 'bold',
      title: 'Bold',
      icon: Bold,
      isActive: () => e.isActive('bold'),
      command: () => e.chain().focus().toggleBold().run(),
    },
    {
      action: 'italic',
      title: 'Italic',
      icon: Italic,
      isActive: () => e.isActive('italic'),
      command: () => e.chain().focus().toggleItalic().run(),
    },
    {
      action: 'strike',
      title: 'Strikethrough',
      icon: Strikethrough,
      isActive: () => e.isActive('strike'),
      command: () => e.chain().focus().toggleStrike().run(),
    },
    {
      action: 'code',
      title: 'Inline Code',
      icon: Code,
      isActive: () => e.isActive('code'),
      command: () => e.chain().focus().toggleCode().run(),
    },
    {
      action: 'link',
      title: 'Link',
      icon: Link,
      isActive: () => e.isActive('link'),
      command: () => showLinkInput(),
    },
  ]
})
</script>
