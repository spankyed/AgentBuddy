<template>
  <!-- Open PR actions -->
  <div v-if="pr && pr.state === 'OPEN'" class="flex items-center gap-1.5 px-3 py-2 border-t border-neutral-800 bg-neutral-800/30">
    <!-- Merge -->
    <div ref="mergeContainer" class="relative">
      <div class="flex">
        <button
          @click="$emit('merge', selectedMethod)"
          :disabled="isMerging || pr.isDraft"
          class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-l bg-green-700/80 text-white hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :title="pr.isDraft ? 'Cannot merge a draft PR' : 'Merge pull request'"
        >
          <Loader2 v-if="isMerging" :size="11" class="animate-spin" />
          <GitMerge v-else :size="11" />
          <span>{{ mergeMethodList.find(m => m.value === selectedMethod)?.shortLabel }}</span>
        </button>
        <button
          @click="showMergeOptions = !showMergeOptions"
          :disabled="isMerging || pr.isDraft"
          class="px-1 py-1 rounded-r bg-green-700/80 text-white hover:bg-green-600 transition-colors border-l border-green-600/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronDown :size="11" />
        </button>
      </div>
      <!-- Merge method dropdown -->
      <div
        v-if="showMergeOptions"
        class="absolute bottom-full left-0 mb-1 rounded border border-neutral-700 bg-neutral-800 shadow-lg z-50 whitespace-nowrap"
      >
        <button
          v-for="method in mergeMethodList"
          :key="method.value"
          @click="selectMethod(method.value)"
          class="flex items-center w-full gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-neutral-700"
          :class="selectedMethod === method.value ? 'text-green-400' : 'text-neutral-300'"
        >
          <Check v-if="selectedMethod === method.value" :size="10" />
          <span v-else class="w-[10px]" />
          {{ method.label }}
        </button>
      </div>
    </div>

    <!-- Draft toggle -->
    <button
      @click="$emit('toggle-draft')"
      :disabled="isTogglingDraft"
      class="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
      :class="pr.isDraft
        ? 'bg-blue-700/50 text-blue-300 hover:bg-blue-700/70'
        : 'bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700'"
      :title="pr.isDraft ? 'Mark as ready for review' : 'Convert to draft'"
    >
      <Loader2 v-if="isTogglingDraft" :size="11" class="animate-spin" />
      <FileEdit v-else :size="11" />
      <span>{{ pr.isDraft ? 'Ready' : 'Draft' }}</span>
    </button>

    <div class="flex-1" />

    <!-- Close -->
    <button
      @click="$emit('close')"
      :disabled="isClosing"
      class="flex items-center gap-1 px-2 py-1 text-xs rounded text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
      title="Close pull request"
    >
      <Loader2 v-if="isClosing" :size="11" class="animate-spin" />
      <XCircle v-else :size="11" />
      <span>Close</span>
    </button>
  </div>

  <!-- Merged/Closed PR actions -->
  <div v-else-if="pr && (pr.state === 'MERGED' || pr.state === 'CLOSED')" class="flex items-center gap-1.5 px-3 py-2 border-t border-neutral-800 bg-neutral-800/30">
    <button
      @click="$emit('delete-branch')"
      :disabled="isDeletingBranch"
      class="flex items-center gap-1 px-2 py-1 text-xs rounded text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
      title="Delete remote branch"
    >
      <Loader2 v-if="isDeletingBranch" :size="11" class="animate-spin" />
      <Trash2 v-else :size="11" />
      <span>Delete Branch</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { GitMerge, ChevronDown, Check, XCircle, FileEdit, Loader2, Trash2 } from 'lucide-vue-next'
import { useClickOutside } from '@/core/composables/useClickOutside'
import type { GhPullRequest } from '@app/api'

defineProps<{
  pr: GhPullRequest | null
  isMerging: boolean
  isClosing: boolean
  isTogglingDraft: boolean
  isDeletingBranch: boolean
}>()

defineEmits<{
  'merge': [method: 'merge' | 'squash' | 'rebase']
  'close': []
  'toggle-draft': []
  'delete-branch': []
}>()

const showMergeOptions = ref(false)
const selectedMethod = ref<'merge' | 'squash' | 'rebase'>('merge')
const mergeContainer = useTemplateRef<HTMLElement>('mergeContainer')

useClickOutside(mergeContainer, () => {
  showMergeOptions.value = false
})

const mergeMethodList = [
  { value: 'merge' as const, label: 'Create a merge commit', shortLabel: 'Merge' },
  { value: 'squash' as const, label: 'Squash and merge', shortLabel: 'Squash' },
  { value: 'rebase' as const, label: 'Rebase and merge', shortLabel: 'Rebase' },
]

const selectMethod = (method: 'merge' | 'squash' | 'rebase') => {
  selectedMethod.value = method
  showMergeOptions.value = false
}
</script>
