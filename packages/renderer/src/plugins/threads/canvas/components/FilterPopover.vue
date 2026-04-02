<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="bottom"
        :side-offset="4"
        align="start"
        class="w-64 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden"
      >
        <!-- Status section -->
        <div v-if="statuses.length > 0" class="px-3 pt-3 pb-2">
          <span class="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Status</span>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <button
              v-for="status in statuses"
              :key="status.label"
              type="button"
              class="px-2.5 py-1 text-xs rounded-full border transition-colors"
              :class="selectedStatuses.includes(status.label)
                ? 'border-transparent text-white'
                : 'border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'"
              :style="selectedStatuses.includes(status.label)
                ? { backgroundColor: status.color }
                : { backgroundColor: status.color + '20' }"
              @click="toggleStatus(status.label)"
            >
              {{ status.label }}
            </button>
          </div>
        </div>

        <!-- Tags section -->
        <div v-if="tags.length > 0" class="px-3 pt-2 pb-3" :class="statuses.length > 0 ? 'border-t border-neutral-800' : 'pt-3'">
          <span class="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Tags</span>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <button
              v-for="tag in tags"
              :key="tag.name"
              type="button"
              class="px-2.5 py-1 text-xs rounded-full border transition-colors"
              :class="selectedTags.includes(tag.name)
                ? 'border-transparent text-white'
                : 'border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'"
              :style="selectedTags.includes(tag.name)
                ? { backgroundColor: tag.color || '#525252' }
                : { backgroundColor: (tag.color || '#525252') + '20' }"
              @click="toggleTag(tag.name)"
            >
              {{ tag.name }}
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="statuses.length === 0 && tags.length === 0" class="px-3 py-4 text-sm text-neutral-500 text-center">
          No filter options available
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import type { ThreadStatusOption, ThreadTagOption } from '@app/api'

defineProps<{
  statuses: ThreadStatusOption[]
  tags: ThreadTagOption[]
  selectedStatuses: string[]
  selectedTags: string[]
}>()

const emit = defineEmits<{
  (e: 'toggle-status', status: string): void
  (e: 'toggle-tag', tag: string): void
}>()

const open = ref(false)

function toggleStatus(status: string) {
  emit('toggle-status', status)
}

function toggleTag(tag: string) {
  emit('toggle-tag', tag)
}
</script>
