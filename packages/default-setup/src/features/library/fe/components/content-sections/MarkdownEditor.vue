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
import type { MarkdownContent } from '@/__generated__/types'
import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor'

defineProps<{
  content: MarkdownContent
  entityId?: string
}>()

const emit = defineEmits<{
  update: [content: string]
}>()
</script>
