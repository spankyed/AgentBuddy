<template>
  <div class="rounded-lg border bg-neutral-700/50 border-neutral-600 overflow-hidden">
    <div v-if="label" class="text-xs text-neutral-400 px-4 pt-3 pb-1">
      {{ label }}
    </div>
    <div class="max-h-80 overflow-y-auto px-4 py-3 text-sm">
      <TiptapEditor mode="viewer" variant="chat" :model-value="content" />
    </div>
  </div>
</template>

<script setup lang="ts">
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

interface Props {
  content: string
  label?: string
}

defineProps<Props>()
</script>
