<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-3 pb-3 border-b border-neutral-800 pr-header">
      <div class="flex items-center gap-2">
        <GitPullRequest :size="16" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200">Pull Request</h3>
      </div>
      <div class="flex items-center gap-1">
        <template v-if="prFiles.length > 0">
          <button
            @click="expandAll"
            class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            title="Expand all folders"
          >
            <UnfoldVertical :size="16" />
          </button>
          <button
            @click="collapseAll"
            class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            title="Collapse all folders"
          >
            <FoldVertical :size="16" />
          </button>
        </template>
        <button
          @click="refreshStatus"
          :disabled="isPrLoading"
          class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Refresh PR changes"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': isPrLoading }" />
        </button>
      </div>
    </div>

    <!-- Show only error if no directory selected -->
    <div v-if="isNoDirectoryError" class="p-3 border-b border-red-800 bg-red-900/20">
      <div class="text-sm text-red-400">{{ prError }}</div>
    </div>

    <!-- Show normal UI only when directory is selected -->
    <template v-else>
      <div v-if="prError" class="error-state">
        <AlertCircle class="w-4 h-4 text-red-500" />
        <span class="text-sm text-red-500">{{ prError }}</span>
      </div>

      <div v-else-if="isPrLoading && prFiles.length === 0" class="loading-state">
        <Loader2 class="w-5 h-5 animate-spin" />
        <span class="text-sm text-neutral-400">Loading changes...</span>
      </div>

      <div v-else-if="prFiles.length === 0" class="empty-state">
        <GitBranch class="w-5 h-5 text-neutral-500" />
        <p class="text-sm text-neutral-400">No changes found</p>
        <p class="mt-1 text-xs text-neutral-500">
          Comparing with {{ prBaseBranch || 'base branch' }}
        </p>
      </div>

      <div v-else class="pr-content">
        <div class="branch-info">
          <GitBranch class="w-3 h-3 text-neutral-500" />
          <span class="text-xs text-neutral-400">
            Comparing with {{ prBaseBranch }}
          </span>
        </div>

        <FileTree
          :files="prFiles"
          :all-collapsed="allCollapsed"
          :all-expanded="allExpanded"
          @select-file="handleFileSelect"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import { RefreshCw, AlertCircle, Loader2, GitBranch, GitPullRequest, FoldVertical, UnfoldVertical } from 'lucide-vue-next'
import FileTree from '@/plugins/code/features/pull-request/FileTree.vue'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const prActor = codeActor.system.get('pr')!

// Collapse/Expand state management
const allCollapsed = ref(false)
const allExpanded = ref(false)

// State selectors from PR actor
const prFiles = useSelector(prActor, (state: any) => state.context.prFiles)
const prBaseBranch = useSelector(prActor, (state: any) => state.context.prBaseBranch)
const prError = useSelector(prActor, (state: any) => state.context.prError)
const isPrLoading = useSelector(prActor, (state: any) => state.context.isPrLoading)

// Computed
const isNoDirectoryError = computed(() =>
  prError.value?.includes('No directory selected')
)

// Actions
const refreshStatus = () => {
  prActor?.send({ type: 'pr.REFRESH_STATUS' })
}

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

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: GitStatusFile['status']
  children?: TreeNode[]
  fileCount?: number
}

const handleFileSelect = (file: TreeNode) => {
  if (file.type !== 'file' || !file.status) return

  const gitFile: GitStatusFile = {
    path: file.path,
    status: file.status,
    staged: false
  }

  prActor?.send({ type: 'pr.SELECT_FILE', file: gitFile })
  prActor?.send({ type: 'pr.VIEW_DIFF', path: file.path })
}
</script>

<style scoped>
.error-state,
.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: #71717a;
}

.empty-state {
  flex-direction: column;
}

.pr-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: #0a0a0a;
  border-bottom: 1px solid #27272a;
}

/* Override window drag region to make header elements clickable */
.pr-header {
  -webkit-app-region: no-drag;
}
</style>
