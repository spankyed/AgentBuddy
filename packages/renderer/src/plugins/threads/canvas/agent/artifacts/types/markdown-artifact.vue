<template>
  <div class="max-w-3xl h-full flex flex-col min-h-20">
    <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in flex flex-col min-h-0 flex-1">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div class="flex items-center gap-2">
          <BookText :size="14" class="text-neutral-400" />
          <h3 class="text-sm font-medium text-neutral-200">
            {{ artifact.title || 'Markdown' }}
          </h3>
        </div>
      </div>

      <!-- Markdown body — rendered via TiptapEditor in viewer mode -->
      <div class="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
        <TiptapEditor
          v-if="content"
          mode="viewer"
          variant="chat"
          :model-value="content"
        />
        <p v-else class="text-xs text-neutral-500 italic">
          Empty document.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BookText } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

const props = defineProps<{
  artifact: ArtifactItem
}>()

const content = computed(() =>
  typeof props.artifact.content === 'string'
    ? props.artifact.content
    : props.artifact.content?.notes ?? ''
)
</script>
