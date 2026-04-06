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

      <!-- PR Selector (only when gh is available) -->
      <PRSelector
        v-if="isGhAvailable"
        :openPRs="openPRs"
        :selectedPR="selectedPR"
        @select-pr="handleSelectPR"
        @switch-branch="handleSwitchBranch"
        @new-pr="handleShowCreate"
      />

      <!-- Cannot determine base branch error -->
      <EmptyState
        v-if="isNoBaseBranchError"
        :icon="GitBranch"
        title="Cannot Determine Base Branch"
        subtitle="Unable to determine the base branch for comparison. Check that the repository has a default branch configured."
      />

      <!-- Generic error -->
      <div v-else-if="prError && !isNoGitRepoError" class="flex items-center justify-center gap-2 p-4">
        <AlertCircle class="w-4 h-4 text-red-500" />
        <span class="text-sm text-red-500">{{ prError }}</span>
      </div>

      <!-- Create PR form -->
      <CreatePRForm
        v-else-if="panelMode === 'create' && isGhAvailable"
        :title="createTitle"
        :body="createBody"
        :baseBranch="createBaseBranch"
        :draft="createDraft"
        :defaultBaseBranch="prBaseBranch"
        :hasUpstream="hasUpstream"
        :isCreating="isCreating"
        :isPublishing="isPushing"
        @update-field="handleUpdateField"
        @submit="handleSubmitCreate"
        @cancel="handleCancelCreate"
        @publish-branch="handlePublishBranch"
      />

      <!-- Existing PR view -->
      <template v-else-if="panelMode === 'existing' || !isGhAvailable">
        <!-- Empty state when no PR selected -->
        <EmptyState
          v-if="!selectedPR && isGhAvailable && prFiles.length === 0 && !isPrLoading"
          :icon="GitPullRequest"
          title="No pull request selected"
          subtitle="Select a pull request from the dropdown above"
        />

        <!-- View toggle bar -->
        <div v-if="selectedPR" class="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-800 bg-neutral-800/30">
          <button
            @click="prActor?.send({ type: 'pr.SET_VIEW_MODE', mode: 'comparison' })"
            class="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded transition-colors"
            :class="viewMode === 'comparison'
              ? 'bg-neutral-700 text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-300'"
          >
            <Files :size="11" />
            Files
          </button>
          <button
            @click="prActor?.send({ type: 'pr.SET_VIEW_MODE', mode: 'info' })"
            class="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded transition-colors"
            :class="viewMode === 'info'
              ? 'bg-neutral-700 text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-300'"
          >
            <Info :size="11" />
            Info
          </button>
          <div class="flex-1" />
          <a
            v-if="selectedPR?.url"
            :href="selectedPR.url"
            target="_blank"
            class="p-0.5 rounded text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Open in GitHub"
          >
            <ExternalLink :size="12" />
          </a>
        </div>

        <!-- Comparison view -->
        <PRComparison
          v-if="viewMode === 'comparison'"
          :files="prFiles"
          :baseBranch="prBaseBranch"
          :isLoading="isPrLoading"
          @select-file="handleFileSelect"
          @open-file="handleOpenFile"
        />

        <!-- Info view -->
        <PRInfo
          v-else-if="viewMode === 'info'"
          :pr="selectedPR"
          :comments="prComments"
        />

        <!-- Action bar -->
        <PRActionBar
          v-if="selectedPR && isGhAvailable"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import {
  AlertCircle, AlertTriangle, GitBranch, GitPullRequest, RefreshCw,
  Files, Info, ExternalLink
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
const panelMode = useSelector(prActor, (state: any) => state.context.panelMode)
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

const handleSelectPR = (number: number) => {
  prActor?.send({ type: 'pr.SELECT_PR_BY_NUMBER', number })
}

const handleSwitchBranch = (branch: string) => {
  prActor?.send({ type: 'pr.SWITCH_TO_PR_BRANCH', branchName: branch })
}

const handleShowCreate = () => {
  prActor?.send({ type: 'pr.SHOW_CREATE_FORM' })
}

const handleCancelCreate = () => {
  prActor?.send({ type: 'pr.CANCEL_CREATE' })
}

const handleUpdateField = (field: string, value: any) => {
  prActor?.send({ type: 'pr.UPDATE_CREATE_FIELD', field, value })
}

const handleSubmitCreate = () => {
  prActor?.send({ type: 'pr.SUBMIT_CREATE' })
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
