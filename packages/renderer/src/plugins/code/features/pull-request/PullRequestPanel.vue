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

    <!-- No git repository -->
    <EmptyState
      v-if="isNoGitRepoError"
      :icon="GitPullRequest"
      title="No Git Repository"
      subtitle="Open a folder with a git repository to create and view pull requests"
    />

    <!-- No directory -->
    <NoDirectoryState v-else-if="!baseDirectory" />

    <!-- Main content -->
    <template v-else>
      <!-- gh CLI not available banner -->
      <div
        v-if="!isGhAvailable && !isPrLoading"
        class="flex items-center gap-2 px-3 py-2 text-xs text-yellow-400 bg-yellow-900/20 border-b border-yellow-800/30"
      >
        <AlertTriangle :size="12" class="shrink-0" />
        <span>GitHub CLI not available. Install <code class="px-1 py-0.5 rounded bg-neutral-800">gh</code> and run <code class="px-1 py-0.5 rounded bg-neutral-800">gh auth login</code> for PR features.</span>
      </div>

      <!-- Top action row (when gh is available, hidden in PR view) -->
      <div v-if="isGhAvailable && viewMode !== 'pr'" class="flex items-center gap-1 px-1 border-b border-neutral-800 bg-neutral-800/50 h-[38px]">
        <!-- Selector mode -->
        <template v-if="showSelector">
          <PRSelector
            :openPRs="openPRs"
            :selectedPR="selectedPR"
            @select-pr="handleSelectPRFromDropdown"
          />
          <button
            @click="showSelector = false"
            class="p-1 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 shrink-0"
            title="Close selector"
          >
            <X :size="14" />
          </button>
        </template>

        <!-- Default mode -->
        <template v-else>
          <!-- Unpublished branch -->
          <button
            v-if="!hasUpstream"
            @click="handlePublishBranch()"
            :disabled="isPushing"
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-transparent bg-yellow-700/50 text-yellow-300 hover:bg-yellow-700 transition-colors disabled:opacity-50 flex-1 min-w-0"
          >
            <Loader2 v-if="isPushing" :size="12" class="animate-spin shrink-0" />
            <AlertTriangle v-else :size="12" class="shrink-0" />
            <span class="truncate">Publish Branch</span>
          </button>

          <!-- Published, no PR -->
          <button
            v-else-if="!selectedPR"
            @click="handleCreatePR()"
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-transparent bg-blue-600/80 text-white hover:bg-blue-500 transition-colors flex-1 min-w-0"
          >
            <Plus :size="12" class="shrink-0" />
            <span class="truncate">Create PR</span>
          </button>

          <!-- Has PR -->
          <button
            v-else
            @click="handleViewPRInfo()"
            class="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1 rounded border border-transparent text-left transition-colors hover:bg-neutral-700"
            title="View PR details"
          >
            <GitPullRequest :size="12" class="text-green-400 shrink-0" />
            <span class="text-xs text-neutral-200 truncate">#{{ selectedPR.number }} {{ selectedPR.title }}</span>
            <span
              v-if="selectedPR.isDraft"
              class="text-[9px] px-1 py-0.5 rounded bg-neutral-600 text-neutral-300 shrink-0"
            >DRAFT</span>
          </button>

          <!-- PR select toggle -->
          <button
            @click="showSelector = true"
            class="p-1 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 shrink-0"
            title="Select pull request"
          >
            <List :size="14" />
          </button>
        </template>
      </div>

      <!-- Fatal error: no base branch -->
      <EmptyState
        v-if="isNoBaseBranchError"
        :icon="GitBranch"
        title="Cannot Determine Base Branch"
        subtitle="Unable to determine the base branch for comparison. Check that the repository has a default branch configured."
      />

      <template v-else>
      <!-- PR view (create form or info) -->
      <template v-if="viewMode === 'pr'">
        <!-- Back to files bar -->
        <button
          @click="prActor?.send({ type: 'pr.SET_VIEW_MODE', mode: 'files' })"
          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 border-b border-neutral-800 transition-colors"
        >
          <ArrowLeft :size="11" />
          Back to files
        </button>

        <!-- No PR → create form -->
        <CreatePRForm
          v-if="!selectedPR"
          :title="createTitle"
          :body="createBody"
          :baseBranch="createBaseBranch"
          :draft="createDraft"
          :defaultBaseBranch="prBaseBranch"
          :branches="availableBranches"
          :isCreating="isCreating"
          @update-field="handleUpdateField"
          @submit="handleSubmitCreate"
          @submit-draft="handleSubmitDraft"
        />

        <!-- Existing PR → info + action bar -->
        <template v-else>
          <PRInfo
            :pr="selectedPR"
            :comments="prComments"
          />
          <PRActionBar
            :pr="selectedPR"
            :isMerging="isMerging"
            :isClosing="isClosing"
            :isTogglingDraft="isTogglingDraft"
            @merge="handleMerge"
            @close="handleClose"
            @toggle-draft="handleToggleDraft"
          />
        </template>
      </template>

      <!-- Files view (diff tree) — default -->
      <PRComparison
        v-else
        :files="prFiles"
        :baseBranch="prBaseBranch"
        :currentBranch="currentBranch"
        :isLoading="isPrLoading"
        @select-file="handleFileSelect"
        @open-file="handleOpenFile"
      />
        <!-- Non-fatal error banner (dismissible, pinned to bottom) -->
        <div
          v-if="prError && !isNoGitRepoError && !isNoBaseBranchError"
          class="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 bg-red-900/20 border-t border-red-800/30 mt-auto"
        >
          <AlertCircle :size="12" class="shrink-0" />
          <span class="flex-1">{{ prError }}</span>
          <button
            @click="prActor?.send({ type: 'pr.CLEAR_ERROR' })"
            class="p-0.5 rounded text-red-500 hover:text-red-300 hover:bg-red-900/30 transition-colors shrink-0"
          >
            <X :size="12" />
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import {
  AlertCircle, AlertTriangle, GitBranch, GitPullRequest, RefreshCw,
  ExternalLink, Loader2, Plus, List, X, ArrowLeft
} from 'lucide-vue-next'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import NoDirectoryState from '@/plugins/code/features/NoDirectoryState.vue'
import EmptyState from '@/plugins/code/features/EmptyState.vue'
import PRSelector from '@/plugins/code/features/pull-request/PRSelector.vue'
import PRComparison from '@/plugins/code/features/pull-request/PRComparison.vue'
import CreatePRForm from '@/plugins/code/features/pull-request/CreatePRForm.vue'
import PRInfo from '@/plugins/code/features/pull-request/PRInfo.vue'
import PRActionBar from '@/plugins/code/features/pull-request/PRActionBar.vue'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import type { TreeNode } from './types'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const prActor = codeActor.system.get('pr')!
const commitActor = codeActor.system.get('commit')!

// Local UI state
const showSelector = ref(false)

// State selectors
const prFiles = useSelector(prActor, (state: any) => state.context.prFiles)
const prBaseBranch = useSelector(prActor, (state: any) => state.context.prBaseBranch)
const prError = useSelector(prActor, (state: any) => state.context.prError)
const isPrLoading = useSelector(prActor, (state: any) => state.context.isPrLoading)
const baseDirectory = useSelector(codeActor, (state) => state.context.baseDirectory)
const openPRs = useSelector(prActor, (state: any) => state.context.openPRs)
const selectedPR = useSelector(prActor, (state: any) => state.context.selectedPR)
const prComments = useSelector(prActor, (state: any) => state.context.prComments)
const viewMode = useSelector(prActor, (state: any) => state.context.viewMode)
const isGhAvailable = useSelector(prActor, (state: any) => state.context.isGhAvailable)
const createTitle = useSelector(prActor, (state: any) => state.context.createTitle)
const createBody = useSelector(prActor, (state: any) => state.context.createBody)
const createBaseBranch = useSelector(prActor, (state: any) => state.context.createBaseBranch)
const createDraft = useSelector(prActor, (state: any) => state.context.createDraft)
const isCreating = useSelector(prActor, (state: any) => state.context.isCreating)
const isMerging = useSelector(prActor, (state: any) => state.context.isMerging)
const isClosing = useSelector(prActor, (state: any) => state.context.isClosing)
const isTogglingDraft = useSelector(prActor, (state: any) => state.context.isTogglingDraft)
const hasUpstream = useSelector(commitActor, (state: any) => state.context.hasUpstream)
const isPushing = useSelector(commitActor, (state: any) => state.context.isPushing)
const currentBranch = useSelector(commitActor, (state: any) => state.context.gitBranch)
const availableBranches = useSelector(commitActor, (state: any) => state.context.availableBranches)

// Computed
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

const handleOpenFile = (file: TreeNode) => {
  if (file.type !== 'file' || !file.status) return
  prActor?.send({
    type: 'pr.OPEN_FILE',
    file: { path: file.path, status: file.status, staged: false }
  })
}

const handleFileSelect = (file: TreeNode) => {
  if (file.type !== 'file' || !file.status) return
  const gitFile: GitStatusFile = { path: file.path, status: file.status, staged: false }
  prActor?.send({ type: 'pr.SELECT_FILE', file: gitFile })
  prActor?.send({ type: 'pr.VIEW_DIFF', path: file.path })
}

const handleSelectPRFromDropdown = (number: number) => {
  showSelector.value = false
  prActor?.send({ type: 'pr.SELECT_PR_BY_NUMBER', number })
}

const handleCreatePR = () => {
  prActor?.send({ type: 'pr.NEW_PR' })
  // Ensure branches are loaded for the base branch select
  commitActor?.send({ type: 'commit.GET_ALL_BRANCHES' })
}

const handleViewPRInfo = () => {
  prActor?.send({ type: 'pr.SET_VIEW_MODE', mode: 'pr' })
}

const handleUpdateField = (field: string, value: any) => {
  prActor?.send({ type: 'pr.UPDATE_CREATE_FIELD', field, value })
}

const handleSubmitCreate = () => {
  prActor?.send({ type: 'pr.SUBMIT_CREATE' })
}

const handleSubmitDraft = () => {
  prActor?.send({ type: 'pr.SUBMIT_CREATE_DRAFT' })
}

const handlePublishBranch = () => {
  commitActor?.send({ type: 'commit.PUSH_BRANCH' })
}

const handleMerge = (method: 'merge' | 'squash' | 'rebase') => {
  prActor?.send({ type: 'pr.MERGE', method })
}

const handleClose = () => {
  prActor?.send({ type: 'pr.CLOSE' })
}

const handleToggleDraft = () => {
  prActor?.send({ type: 'pr.TOGGLE_DRAFT' })
}
</script>
