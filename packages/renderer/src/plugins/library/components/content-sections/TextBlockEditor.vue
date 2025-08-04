<template>
  <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 200px;">
    <textarea
      :value="content.content"
      @input="updateContent(($event.target as HTMLTextAreaElement).value)"
      placeholder="Enter text content..."
      class="w-full h-full px-4 py-3 text-sm transition-colors resize-none bg-neutral-800 text-neutral-100 focus:outline-none"
    />
  </div>
</template>

<script setup lang="ts">
import type { TextBlockContent } from '@app/api'

const props = defineProps<{
  content: TextBlockContent
}>()

const emit = defineEmits<{
  update: [content: string]
}>()

const updateContent = (value: string) => {
  emit('update', value)
}
</script>