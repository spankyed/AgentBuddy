<template>
  <div ref="dropdownContainer" class="relative flex-1 min-w-0">
    <button
      @click="isDropdownOpen = !isDropdownOpen"
      class="flex items-center w-full gap-2 px-2 py-1 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
    >
      <GitPullRequest :size="12" class="shrink-0" />
      <span class="truncate flex-1 text-left">
        {{ selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : 'Select a pull request...' }}
      </span>
      <span
        v-if="selectedPR?.isDraft"
        class="text-[9px] px-1 py-0.5 rounded bg-neutral-600 text-neutral-300 shrink-0"
      >DRAFT</span>
      <ChevronDown :size="12" class="shrink-0 text-neutral-500" />
    </button>

    <!-- Dropdown -->
    <div
      v-if="isDropdownOpen"
      class="absolute z-50 w-full mt-1 rounded border border-neutral-700 bg-neutral-800 shadow-lg max-h-60 overflow-y-auto"
    >
      <button
        v-for="pr in openPRs"
        :key="pr.number"
        @click="selectPR(pr.number)"
        class="flex items-center w-full gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-neutral-700"
        :class="selectedPR?.number === pr.number ? 'text-blue-400' : 'text-neutral-300'"
      >
        <GitPullRequest :size="11" class="shrink-0" />
        <span class="truncate flex-1">#{{ pr.number }} {{ pr.title }}</span>
        <span
          v-if="pr.isDraft"
          class="text-[9px] px-1 py-0.5 rounded bg-neutral-600 text-neutral-300 shrink-0"
        >DRAFT</span>
        <Check v-if="selectedPR?.number === pr.number" :size="12" class="shrink-0 text-blue-400" />
      </button>
      <div v-if="openPRs.length === 0" class="px-3 py-2 text-xs text-neutral-500">
        No open pull requests
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { GitPullRequest, ChevronDown, Check } from 'lucide-vue-next'
import { useClickOutside } from '@/core/composables/useClickOutside'
import type { GhPullRequest } from '@app/api'

defineProps<{
  openPRs: GhPullRequest[]
  selectedPR: GhPullRequest | null
}>()

const emit = defineEmits<{
  'select-pr': [number: number]
}>()

const isDropdownOpen = ref(false)
const dropdownContainer = useTemplateRef<HTMLElement>('dropdownContainer')

useClickOutside(dropdownContainer, () => {
  isDropdownOpen.value = false
})

const selectPR = (number: number) => {
  isDropdownOpen.value = false
  emit('select-pr', number)
}
</script>
