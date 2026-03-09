<template>
  <div class="border rounded-md border-neutral-700">
    <TiptapEditor
      mode="editor"
      :model-value="content.text"
      placeholder="Enter text content..."
      @update:model-value="emit('update', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { TextBlockContent } from '@app/api'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

defineProps<{
  content: TextBlockContent
}>()

const emit = defineEmits<{
  update: [content: string]
}>()
</script>
