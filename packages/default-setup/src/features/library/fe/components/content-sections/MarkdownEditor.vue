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
import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor'
import type { MarkdownContent } from '@abuddy/sdk';

defineProps<{
  content: MarkdownContent
  entityId?: string
}>()

const emit = defineEmits<{
  update: [content: string]
}>()
</script>
