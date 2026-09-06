<template>
  <div>
    <TiptapEditor
      mode="editor"
      show-gutter
      :model-value="content.text"
      :entity-id="entityId"
      placeholder="Enter markdown content..."
      @update:model-value="emit('update', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { MarkdownContent } from '@/registries/types'
import TiptapEditor from '@abuddy/sdk/fe/components/tiptap/TiptapEditor.vue'

defineProps<{
  content: MarkdownContent
  entityId?: string
}>()

const emit = defineEmits<{
  update: [content: string]
}>()
</script>
