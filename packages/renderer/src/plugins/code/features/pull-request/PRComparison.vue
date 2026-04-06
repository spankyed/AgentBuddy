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
    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800 bg-neutral-800/50">
      <div class="flex items-center gap-1.5" :title="`Comparing with ${baseBranch}`">
        <GitBranch class="w-3 h-3 text-neutral-500" />
        <span class="text-xs text-neutral-300">{{ currentBranch || baseBranch }}</span>
      </div>
      <div class="ml-auto">
        <ContextMenuRoot>
          <ContextMenuTrigger as-child>
            <button
              @click="toggleFolders()"
              class="p-1 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              :title="isExpanded ? 'Collapse all folders' : 'Expand all folders'"
            >
              <ChevronsDownUp v-if="isExpanded" :size="14" />
              <ChevronsUpDown v-else :size="14" />
            </button>
          </ContextMenuTrigger>
          <ContextMenuPortal>
            <ContextMenuContent class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
              <ContextMenuItem
                @select="expandAll()"
                class="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none mx-1"
              >
                <ChevronsUpDown :size="12" />
                Expand all
              </ContextMenuItem>
              <ContextMenuItem
                @select="collapseAll()"
                class="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-200 rounded cursor-pointer hover:bg-neutral-700 outline-none mx-1"
              >
                <ChevronsDownUp :size="12" />
                Collapse all
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenuRoot>
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
import { GitBranch, Loader2, ChevronsUpDown, ChevronsDownUp } from 'lucide-vue-next'
import {
  ContextMenuRoot, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuPortal
} from 'reka-ui'
import EmptyState from '@/plugins/code/features/EmptyState.vue'
import FileTree from '@/plugins/code/features/pull-request/FileTree.vue'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import type { TreeNode } from './types'

defineProps<{
  files: GitStatusFile[]
  baseBranch: string
  currentBranch?: string
  isLoading: boolean
}>()

defineEmits<{
  'select-file': [file: TreeNode]
  'open-file': [file: TreeNode]
}>()

const allCollapsed = ref(false)
const allExpanded = ref(false)
const isExpanded = ref(true)

const expandAll = () => {
  allExpanded.value = true
  setTimeout(() => allExpanded.value = false, 100)
  isExpanded.value = true
}

const collapseAll = () => {
  allCollapsed.value = true
  setTimeout(() => allCollapsed.value = false, 100)
  isExpanded.value = false
}

const toggleFolders = () => {
  if (isExpanded.value) {
    collapseAll()
  } else {
    expandAll()
  }
}
</script>
