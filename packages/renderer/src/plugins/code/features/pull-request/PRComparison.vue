<template>
  <div v-if="isLoading && files.length === 0" class="flex items-center justify-center gap-2 p-4">
    <Loader2 class="w-5 h-5 animate-spin" />
    <span class="text-sm text-neutral-400">Loading changes...</span>
  </div>

  <EmptyState
    v-else-if="files.length === 0"
    :icon="GitBranch"
    title="No changes found"
    :subtitle="`Comparing with ${baseBranch || 'base branch'}`"
  />

  <div v-else class="flex flex-col flex-1 overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-2 border-b border-neutral-800 bg-neutral-800/50">
      <GitBranch class="w-3 h-3 text-neutral-500" />
      <span class="text-xs text-neutral-400">
        Comparing with {{ baseBranch }}
      </span>
      <div class="flex items-center gap-1 ml-auto">
        <button
          @click="expandAll()"
          class="p-1 m-1 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Expand all folders"
        >
          <UnfoldVertical :size="14" />
        </button>
        <button
          @click="collapseAll()"
          class="p-1 m-1 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Collapse all folders"
        >
          <FoldVertical :size="14" />
        </button>
      </div>
    </div>

    <FileTree
      :files="files"
      :all-collapsed="allCollapsed"
      :all-expanded="allExpanded"
      @select-file="$emit('select-file', $event)"
      @open-file="$emit('open-file', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { GitBranch, Loader2, UnfoldVertical, FoldVertical } from 'lucide-vue-next'
import EmptyState from '@/plugins/code/features/EmptyState.vue'
import FileTree from '@/plugins/code/features/pull-request/FileTree.vue'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import type { TreeNode } from './types'

defineProps<{
  files: GitStatusFile[]
  baseBranch: string
  isLoading: boolean
}>()

defineEmits<{
  'select-file': [file: TreeNode]
  'open-file': [file: TreeNode]
}>()

const allCollapsed = ref(false)
const allExpanded = ref(false)

const toggleAllFolders = (expand: boolean) => {
  if (expand) {
    allExpanded.value = true
    setTimeout(() => allExpanded.value = false, 100)
  } else {
    allCollapsed.value = true
    setTimeout(() => allCollapsed.value = false, 100)
  }
}

const collapseAll = () => toggleAllFolders(false)
const expandAll = () => toggleAllFolders(true)
</script>
