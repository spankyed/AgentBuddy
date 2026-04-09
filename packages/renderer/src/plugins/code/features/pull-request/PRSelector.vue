<template>
  <div ref="dropdownContainer" class="relative flex-1 min-w-0">
    <button
      @click="isDropdownOpen = !isDropdownOpen"
      class="flex items-center w-full gap-1.5 pl-2 pr-2.5 py-1.5 text-xs rounded border border-neutral-700 text-neutral-300 bg-neutral-900 hover:bg-neutral-800 transition-colors"
    >
      <GitPullRequest :size="12" :class="[prStatusColor(selectedPR), 'shrink-0']" />
      <span class="truncate min-w-0 text-left">
        {{ selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : 'Select a pull request...' }}
      </span>
      <span
        v-if="selectedPR?.state === 'MERGED'"
        class="text-[9px] px-1 leading-4 rounded bg-purple-600/50 text-purple-300 shrink-0"
      >MERGED</span>
      <span
        v-else-if="selectedPR?.state === 'CLOSED'"
        class="text-[9px] px-1 leading-4 rounded bg-red-600/50 text-red-300 shrink-0"
      >CLOSED</span>
      <span
        v-else-if="selectedPR?.isDraft"
        class="text-[9px] px-1 leading-4 rounded bg-neutral-600 text-neutral-300 shrink-0"
      >DRAFT</span>
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
        <GitPullRequest :size="11" :class="[prStatusColor(pr), 'shrink-0']" />
        <span class="truncate">#{{ pr.number }} {{ pr.title }}</span>
        <span
          v-if="pr.state === 'MERGED'"
          class="text-[9px] px-1 leading-4 rounded bg-purple-600/50 text-purple-300 shrink-0"
        >MERGED</span>
        <span
          v-else-if="pr.state === 'CLOSED'"
          class="text-[9px] px-1 leading-4 rounded bg-red-600/50 text-red-300 shrink-0"
        >CLOSED</span>
        <span
          v-else-if="pr.isDraft"
          class="text-[9px] px-1 leading-4 rounded bg-neutral-600 text-neutral-300 shrink-0"
        >DRAFT</span>
      </button>
      <div v-if="openPRs.length === 0" class="px-3 py-2 text-xs text-neutral-500">
        No open pull requests
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { GitPullRequest } from 'lucide-vue-next'
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

function prStatusColor(pr: GhPullRequest | null): string {
  if (!pr) return 'text-neutral-400'
  if (pr.state === 'MERGED') return 'text-purple-400'
  if (pr.state === 'CLOSED') return 'text-red-400'
  if (pr.isDraft) return 'text-neutral-400'
  return 'text-green-400'
}
</script>
