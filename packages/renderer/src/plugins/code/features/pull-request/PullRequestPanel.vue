<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <CodePanelHeader
      :icon="GitPullRequest"
      title="Pull Request"
    >
      <template #actions>
        <button
          @click="refreshStatus()"
          :disabled="isPrLoading"
          class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Refresh PR changes"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': isPrLoading }" />
        </button>
      </template>
    </CodePanelHeader>

    <!-- Show friendly empty state if no git repository -->
    <EmptyState
      v-if="isNoGitRepoError"
      :icon="GitPullRequest"
      title="No Git Repository"
      subtitle="Open a folder with a git repository to create and view pull requests"
    />

    <!-- Show error if no directory selected -->
    <NoDirectoryState v-else-if="!baseDirectory" />

    <!-- Show normal UI only when directory is selected and has git -->
    <template v-else>
      <!-- Show friendly empty state if cannot determine base branch -->
      <EmptyState
        v-if="isNoBaseBranchError"
        :icon="GitBranch"
        title="Cannot Determine Base Branch"
        subtitle="Unable to determine the base branch for comparison. Check that the repository has a default branch configured."
      />

      <!-- Generic error state for other errors -->
      <div v-else-if="prError" class="error-state">
        <AlertCircle class="w-4 h-4 text-red-500" />
        <span class="text-sm text-red-500">{{ prError }}</span>
      </div>

      <div v-else-if="isPrLoading && prFiles.length === 0" class="loading-state">
        <Loader2 class="w-5 h-5 animate-spin" />
        <span class="text-sm text-neutral-400">Loading changes...</span>
      </div>

      <EmptyState
        v-else-if="prFiles.length === 0"
        :icon="GitBranch"
        title="No changes found"
        :subtitle="`Comparing with ${prBaseBranch || 'base branch'}`"
      />

      <div v-else class="pr-content">
        <div class="branch-info bg-neutral-800/50">
          <GitBranch class="w-3 h-3 text-neutral-500" />
          <span class="text-xs text-neutral-400">
            Comparing with {{ prBaseBranch }}
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
          :files="prFiles"
          :all-collapsed="allCollapsed"
          :all-expanded="allExpanded"
          @select-file="handleFileSelect"
          @open-file="handleOpenFile"
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
import { AlertCircle, Loader2, GitBranch, GitPullRequest, RefreshCw, UnfoldVertical, FoldVertical } from 'lucide-vue-next'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import NoDirectoryState from '@/plugins/code/features/NoDirectoryState.vue'
import EmptyState from '@/plugins/code/features/EmptyState.vue'
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
const baseDirectory = useSelector(codeActor, (state) => state.context.baseDirectory)

// Computed
const isNoDirectoryError = computed(() =>
  prError.value?.includes('No directory selected')
)

const isNoGitRepoError = computed(() =>
  prError.value?.includes('not a git repository') ||
  prError.value?.includes('Not a git repository')
)

const isNoBaseBranchError = computed(() =>
  prError.value?.includes('Could not determine PR base branch')
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


const handleOpenFile = (file: TreeNode) => {
  if (file.type !== 'file' || !file.status) return
  prActor?.send({
    type: 'pr.OPEN_FILE',
    file: { path: file.path, status: file.status, staged: false }
  })
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
  border-bottom: 1px solid #27272a;
}

</style>
