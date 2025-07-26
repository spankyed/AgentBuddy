<template>
  <div class="pr-panel-container bg-neutral-900">
    <div class="pr-header">
      <h3 class="text-sm font-medium">Pull Request Changes</h3>
      <button
        @click="refreshStatus"
        :disabled="isPrLoading"
        class="refresh-btn"
        title="Refresh PR changes"
      >
        <RefreshCw :class="['w-4 h-4', { 'animate-spin': isPrLoading }]" />
      </button>
    </div>

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
        @select-file="handleFileSelect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import { RefreshCw, AlertCircle, Loader2, GitBranch } from 'lucide-vue-next'
import FileTree from '@/plugins/code/features/pull-request/FileTree.vue'
import type { GitStatusFile } from '@/plugins/code/state'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const prActor = codeActor.system.get('pullRequest')!


// State selectors from PR actor
const prFiles = useSelector(prActor, (state: any) => state.context.prFiles)
const prBaseBranch = useSelector(prActor, (state: any) => state.context.prBaseBranch)
const prError = useSelector(prActor, (state: any) => state.context.prError)
const isPrLoading = useSelector(prActor, (state: any) => state.context.isPrLoading)

// Actions
const refreshStatus = () => {
  prActor?.send({ type: 'pr.REFRESH_STATUS' })
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: GitStatusFile['status']
  children?: TreeNode[]
  fileCount?: number
}

const handleFileSelect = (file: TreeNode) => {
  if (file.type === 'file' && file.status) {
    // First select the file
    const gitFile: GitStatusFile = {
      path: file.path,
      status: file.status,
      staged: false
    }
    
    prActor?.send({ type: 'pr.SELECT_FILE', file: gitFile })
    
    // Then request the diff
    prActor?.send({ type: 'pr.VIEW_DIFF', path: file.path })
  }
}
</script>

<style scoped>
.pr-panel-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #27272a;
}

.refresh-btn {
  padding: 0.25rem;
  border-radius: 0.25rem;
  transition: background-color 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background-color: #27272a;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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
</style>