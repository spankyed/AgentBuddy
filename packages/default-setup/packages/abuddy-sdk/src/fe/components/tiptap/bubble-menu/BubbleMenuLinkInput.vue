<template>
  <div v-if="visible" class="flex items-center gap-1.5 px-1.5 py-1 border-t border-neutral-700">
    <input
      ref="inputRef"
      v-model="linkUrl"
      type="url"
      class="w-56 px-2 py-1 text-sm bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
      placeholder="Enter URL"
      @keydown.enter="applyLink"
      @keydown.escape="cancel"
    />
    <button @click="applyLink" class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded">
      Apply
    </button>
    <button v-if="hasExistingLink" @click="removeLink" class="p-1 text-neutral-400 hover:text-red-400 transition-colors" title="Remove link">
      <X :size="14" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { X } from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()

const visible = ref(false)
const linkUrl = ref('')
const inputRef = ref<HTMLInputElement>()
const hasExistingLink = ref(false)

function reset() {
  visible.value = false
  linkUrl.value = ''
}

onMounted(() => { props.editor.on('selectionUpdate', reset) })
onBeforeUnmount(() => { props.editor.off('selectionUpdate', reset) })

function show() {
  const existing = props.editor.getAttributes('link').href
  linkUrl.value = existing || ''
  hasExistingLink.value = !!existing
  visible.value = true
  nextTick(() => inputRef.value?.focus())
}

function applyLink() {
  const url = linkUrl.value.trim()
  if (!url) { reset(); return }
  props.editor.chain().focus().setLink({ href: url }).run()
  reset()
}

function removeLink() {
  props.editor.chain().focus().unsetLink().run()
  reset()
}

function cancel() {
  reset()
  props.editor.chain().focus().run()
}

defineExpose({ show })
</script>
