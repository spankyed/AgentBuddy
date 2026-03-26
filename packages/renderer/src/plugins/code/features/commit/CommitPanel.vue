<template>
  <div class="flex flex-col h-full overflow-hidden min-w-0">
    <!-- Header -->
    <CodePanelHeader
      :icon="GitCommit"
      title="Source Control"
    >
      <template #actions>
        <button
          @click="refreshStatus()"
          :disabled="isGitLoading"
          class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="Refresh"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': isGitLoading }" />
        </button>
      </template>
    </CodePanelHeader>

    <!-- Revert Dialog -->
    <RevertDialog
      :show="!!revertDialogFile"
      :file="revertDialogFile"
      @confirm="confirmRevert"
      @cancel="cancelRevert"
    />

    <!-- Discard All Dialog -->
    <RevertDialog
      :show="showDiscardAllDialog"
      :file="null"
      :fileCount="unstagedFiles.length"
      @confirm="confirmDiscardAll"
      @cancel="cancelDiscardAll"
    />

    <!-- Show friendly empty state if no git repository -->
    <div v-if="isNoGitRepoError" class="flex flex-col items-center justify-center flex-1 gap-2 p-8 text-center">
      <GitBranch class="w-5 h-5 text-neutral-500" />
      <p class="text-sm text-neutral-400">No Git Repository</p>
      <p class="max-w-xs text-xs text-neutral-500">
        Open a folder with a git repository to use source control features
      </p>
    </div>

    <!-- Show error if no directory selected -->
    <NoDirectoryState v-else-if="!baseDirectory" />

    <!-- Show normal UI only when directory is selected and has git -->
    <template v-else>
      <!-- Branch Info -->
      <div class="px-4 py-2 border-b border-neutral-800 bg-neutral-800/50">
      <div class="flex items-center gap-2">
        <GitBranch :size="14" class="text-neutral-400" />
        <span class="text-xs text-neutral-300">Branch</span>
        <button
          @click="commitActor?.send({ type: 'commit.PULL_BRANCH' })"
          :disabled="isPulling || !hasUpstream"
          class="relative ml-auto p-1 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Pull latest"
        >
          <Loader2 v-if="isPulling" :size="14" class="animate-spin" />
          <ArrowDownToLine v-else :size="14" />
          <span
            v-if="commitsBehind > 0"
            class="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 text-[9px] font-bold leading-none text-white bg-blue-600 rounded-full"
          >{{ commitsBehind }}</span>
        </button>
      </div>

      <!-- Create Branch Mode -->
      <div v-if="isCreatingBranch" class="flex items-center gap-1.5 mt-2">
        <input
          ref="newBranchInput"
          v-model="newBranchName"
          @keyup.enter="confirmCreateBranch"
          @keyup.escape="cancelCreateBranch"
          placeholder="New branch name..."
          class="flex-1 min-w-0 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
        />
        <button
          @click="confirmCreateBranch"
          :disabled="!newBranchName.trim()"
          class="p-1.5 rounded transition-colors text-green-400 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Create branch"
        >
          <Check :size="14" />
        </button>
        <button
          @click="cancelCreateBranch"
          class="p-1.5 rounded transition-colors text-neutral-400 hover:bg-neutral-700"
          title="Cancel"
        >
          <X :size="14" />
        </button>
      </div>

      <!-- Branch Select Mode -->
      <div v-else class="relative flex items-center gap-1.5 mt-2">
        <div class="relative flex-1 min-w-0">
          <input
            v-model="branchInput"
            @input="updateBranchInput"
            @keyup.enter="checkoutBranch"
            @focus="showBranchDropdown = true"
            @blur="hideBranchDropdown"
            :disabled="isCheckingOutBranch"
            :placeholder="gitBranch || 'Select branch...'"
            class="w-full px-3 py-1.5 pr-8 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 disabled:opacity-50"
          />
          <ChevronDown
            :size="14"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
        </div>
        <button
          @click="startCreateBranch"
          class="p-1.5 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
          title="Create new branch"
        >
          <GitBranchPlus :size="14" />
        </button>

        <!-- Dropdown -->
        <div
          v-if="showBranchDropdown && filteredBranches.length > 0"
          class="absolute left-0 right-8 z-10 mt-1 top-full bg-neutral-900 border border-neutral-700 rounded shadow-lg max-h-48 overflow-y-auto"
        >
          <div
            v-for="branch in filteredBranches"
            :key="branch"
            @mousedown.prevent="selectBranch(branch)"
            class="px-3 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-2"
          >
            <GitBranch :size="12" class="text-neutral-400" />
            <span class="text-xs text-neutral-300">{{ branch }}</span>
            <CheckCircle v-if="branch === gitBranch" :size="12" class="ml-auto text-green-500" />
          </div>
        </div>
      </div>
    </div>

    <!-- Git Error (only show non-directory errors) -->
    <div v-if="gitError && !isNoDirectoryError" class="p-3 border-b border-red-800 bg-red-900/20">
      <div class="text-sm text-red-400">{{ gitError }}</div>
    </div>

    <!-- Commit Message -->
    <div class="p-3 border-b border-neutral-800">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm text-neutral-400">Commit Message</label>
          <button
            @click="generateMessage"
            :disabled="isGeneratingMessage || gitStatus.length === 0"
            class="p-1 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate commit message with AI"
          >
            <Sparkles v-if="!isGeneratingMessage" :size="14" />
            <Loader2 v-else :size="14" class="animate-spin" />
          </button>
        </div>
        <textarea
          v-model="commitMessage"
          @input="updateCommitMessage"
          placeholder="Enter commit message..."
          class="w-full px-3 py-2 text-sm border rounded resize-none bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          rows="3"
        />
        <button
          v-if="shouldShowActionButton"
          @click="handleActionButton"
          :disabled="isActionButtonDisabled"
          :class="[
            'w-full px-3 py-1.5 rounded text-sm font-medium transition-colors',
            !isActionButtonDisabled
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
          ]"
        >
          {{ actionButtonText }}
        </button>

        <button
          v-else
          @click="commit"
          :disabled="!canCommit"
          :class="[
            'w-full px-3 py-1.5 rounded text-sm font-medium transition-colors',
            canCommit
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
          ]"
        >
          Commit
        </button>
      </div>
    </div>

    <!-- File Changes -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="gitStatus.length === 0" class="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <GitCommit class="w-5 h-5 text-neutral-500" />
        <p class="text-sm text-neutral-400">No changes to commit</p>
        <p class="text-xs text-neutral-500">Working tree is clean</p>
      </div>

      <div v-else class="divide-y divide-neutral-800">
        <!-- Staged Changes -->
        <div v-if="stagedFiles.length > 0" class="p-3">
          <div class="flex items-center justify-between mb-2 mr-2">
            <span class="text-xs font-medium text-neutral-400">STAGED CHANGES</span>
            <button @click="unstageAll" class="p-0.5 hover:bg-neutral-700 rounded" title="Unstage All">
              <Minus class="w-3 h-3 text-neutral-400" />
            </button>
          </div>
          <div class="space-y-1">
            <div
              v-for="file in stagedFiles"
              :key="`staged-${file.path}`"
              @click="selectFile(file)"
              :title="file.status === 'renamed' && file.originalPath ? `${file.originalPath} → ${file.path}` : file.path"
              :class="[
                'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors',
                selectedGitFile?.path === file.path && selectedGitFile?.staged === file.staged
                  ? 'bg-neutral-800'
                  : 'hover:bg-neutral-800/50'
              ]"
            >

              <div class="flex-1 min-w-0 flex items-center gap-1.5">
                <span class="text-sm font-medium text-neutral-200 flex-shrink-0">{{ getFileDisplay(file.path, file).filename }}</span>
                <span v-if="getFileDisplay(file.path, file).directory" dir="rtl" class="text-xs text-neutral-500 truncate">
                  {{ getFileDisplay(file.path, file).directory }}
                </span>
              </div>
              <span :class="getStatusColor(file.status)" class="flex-shrink-0 w-4 text-xs font-medium">
                {{ getStatusIcon(file.status) }}
              </span>
              <button
                @click.stop="openFile(file)"
                class="p-0.5 hover:bg-neutral-700 rounded"
                title="Open file"
              >
                <FileText class="w-3 h-3 text-neutral-400" />
              </button>

              <button @click.stop="unstageFile(file)" class="p-0.5 hover:bg-neutral-700 rounded" title="Unstage">
                <Minus class="w-3 h-3 text-neutral-400" />
              </button>
            </div>
          </div>
        </div>

        <!-- Unstaged Changes -->
        <div v-if="unstagedFiles.length > 0" class="p-3">
          <div class="flex items-center justify-between mb-2 mr-2">
            <span class="text-xs font-medium text-neutral-400">CHANGES</span>
            <div class="flex items-center gap-1">
              <button @click="openDiscardAllDialog" class="p-0.5 hover:bg-neutral-700 rounded" title="Discard All Changes">
                <RotateCcw class="w-3 h-3 text-red-400" />
              </button>
              <button @click="stageAll" class="p-0.5 hover:bg-neutral-700 rounded" title="Stage All Changes">
                <Plus class="w-3 h-3 text-neutral-400" />
              </button>
            </div>
          </div>
          <div class="space-y-1">
            <div
              v-for="file in unstagedFiles"
              :key="`unstaged-${file.path}`"
              @click="selectFile(file)"
              :title="file.status === 'renamed' && file.originalPath ? `${file.originalPath} → ${file.path}` : file.path"
              :class="[
                'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors',
                selectedGitFile?.path === file.path && selectedGitFile?.staged === file.staged
                  ? 'bg-neutral-800'
                  : 'hover:bg-neutral-800/50'
              ]"
            >

              <div class="flex-1 min-w-0 flex items-center gap-1.5">
                <span class="text-sm font-medium text-neutral-200 flex-shrink-0">{{ getFileDisplay(file.path, file).filename }}</span>
                <span v-if="getFileDisplay(file.path, file).directory" dir="rtl" class="text-xs text-neutral-500 truncate">
                  {{ getFileDisplay(file.path, file).directory }}
                </span>
              </div>
              <span :class="getStatusColor(file.status)" class="flex-shrink-0 w-4 text-xs font-medium">
                {{ getStatusIcon(file.status) }}
              </span>
              <button
                @click.stop="openFile(file)"
                class="p-0.5 hover:bg-neutral-700 rounded"
                title="Open file"
              >
                <File class="w-3 h-3 text-neutral-400" />
              </button>
              <button @click.stop="openRevertDialog(file)" class="p-0.5 hover:bg-neutral-700 rounded" title="Discard changes">
                <RotateCcw class="w-3 h-3 text-red-400" />
              </button>
              <button @click.stop="stageFile(file)" class="p-0.5 hover:bg-neutral-700 rounded" title="Stage">
                <Plus class="w-3 h-3 text-neutral-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import { GitBranch, GitBranchPlus, GitCommit, RefreshCw, Plus, Minus, RotateCcw, File, ChevronDown, CheckCircle, Check, X, Sparkles, Loader2, ArrowDownToLine } from 'lucide-vue-next'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import NoDirectoryState from '@/plugins/code/features/NoDirectoryState.vue'
import RevertDialog from '@/plugins/code/features/commit/RevertDialog.vue'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const commitActor = codeActor.system.get('commit')!

// State selectors from commit actor
const gitStatus = useSelector(commitActor, (state: any) => state.context.gitStatus)
const gitBranch = useSelector(commitActor, (state: any) => state.context.gitBranch)
const gitError = useSelector(commitActor, (state: any) => state.context.gitError)
const isGitLoading = useSelector(commitActor, (state: any) => state.context.isGitLoading)
const selectedGitFile = useSelector(commitActor, (state: any) => state.context.selectedGitFile)
const commitMessage = useSelector(commitActor, (state: any) => state.context.commitMessage)
const revertDialogFile = useSelector(commitActor, (state: any) => state.context.revertDialogFile)
const availableBranches = useSelector(commitActor, (state: any) => state.context.availableBranches)
const branchInput = useSelector(commitActor, (state: any) => state.context.branchInput)
const isCheckingOutBranch = useSelector(commitActor, (state: any) => state.context.isCheckingOutBranch)
const hasUpstream = useSelector(commitActor, (state: any) => state.context.hasUpstream)
const commitsAhead = useSelector(commitActor, (state: any) => state.context.commitsAhead)
const commitsBehind = useSelector(commitActor, (state: any) => state.context.commitsBehind)
const isPushing = useSelector(commitActor, (state: any) => state.context.isPushing)
const isPulling = useSelector(commitActor, (state: any) => state.context.isPulling)
const isGeneratingMessage = useSelector(commitActor, (state: any) => state.context.isGeneratingMessage)
const baseDirectory = useSelector(codeActor, (state) => state.context.baseDirectory)

// Local state
const showDiscardAllDialog = ref(false)
const showBranchDropdown = ref(false)
const isCreatingBranch = ref(false)
const newBranchName = ref('')
const newBranchInput = ref<HTMLInputElement | null>(null)

// Computed
const stagedFiles = computed(() => gitStatus.value.filter((f: any) => f.staged))
const unstagedFiles = computed(() => gitStatus.value.filter((f: any) => !f.staged))
const canCommit = computed(() => commitMessage.value.trim() && stagedFiles.value.length > 0)

const isNoDirectoryError = computed(() => {
  return gitError.value?.includes('No directory selected')
})

const isNoGitRepoError = computed(() => {
  return gitError.value?.includes('not a git repository') ||
         gitError.value?.includes('Not a git repository')
})

const shouldShowActionButton = computed(() => {
  // Commit button takes priority when there are staged files
  if (stagedFiles.value.length > 0) return false
  return !hasUpstream.value || commitsAhead.value > 0 || commitsBehind.value > 0
})

const actionButtonText = computed(() => {
  if (isPushing.value) return 'Pushing...'
  if (isPulling.value) return 'Pulling...'
  if (!hasUpstream.value) return 'Publish Branch'

  // If we have both commits ahead and behind, prioritize pull
  if (commitsBehind.value > 0 && commitsAhead.value === 0) {
    return `Pull (${commitsBehind.value} commit${commitsBehind.value !== 1 ? 's' : ''} behind)`
  }

  if (commitsAhead.value > 0) {
    return `Push (${commitsAhead.value} commit${commitsAhead.value !== 1 ? 's' : ''})`
  }

  return 'Sync'
})

const isActionButtonPull = computed(() => {
  return hasUpstream.value && commitsBehind.value > 0 && commitsAhead.value === 0
})

const isActionButtonDisabled = computed(() => {
  return isPushing.value || isPulling.value
})

const filteredBranches = computed(() => {
  const input = branchInput.value.toLowerCase().trim()
  if (!input) return availableBranches.value
  return availableBranches.value.filter((branch: string) =>
    branch.toLowerCase().includes(input)
  )
})

// Event handlers
const refreshStatus = () => {
  commitActor?.send({ type: 'commit.REFRESH_STATUS' })
}

const selectFile = (file: GitStatusFile) => {
  commitActor?.send({ type: 'commit.SELECT_FILE', file })
  commitActor?.send({ type: 'commit.VIEW_DIFF', path: file.path, staged: file.staged })
}

const stageFile = (file: GitStatusFile) => {
  commitActor?.send({ type: 'commit.STAGE_FILES', paths: [file.path] })
}

const unstageFile = (file: GitStatusFile) => {
  commitActor?.send({ type: 'commit.UNSTAGE_FILES', paths: [file.path] })
}

const generateMessage = () => {
  commitActor?.send({ type: 'commit.GENERATE_MESSAGE' })
}

const updateCommitMessage = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  commitActor?.send({ type: 'commit.UPDATE_MESSAGE', message: target.value })
}

const commit = () => {
  if (canCommit.value) {
    commitActor?.send({ type: 'commit.COMMIT' })
  }
}

const handleActionButton = () => {
  if (isActionButtonPull.value) {
    commitActor?.send({ type: 'commit.PULL_BRANCH' })
  } else {
    commitActor?.send({ type: 'commit.PUSH_BRANCH' })
  }
}

const stageAll = () => {
  commitActor?.send({ type: 'commit.STAGE_FILES', paths: unstagedFiles.value.map((f: GitStatusFile) => f.path) })
}

const unstageAll = () => {
  commitActor?.send({ type: 'commit.UNSTAGE_FILES', paths: stagedFiles.value.map((f: GitStatusFile) => f.path) })
}

const openDiscardAllDialog = () => {
  showDiscardAllDialog.value = true
}

const confirmDiscardAll = () => {
  commitActor?.send({ type: 'commit.REVERT_FILES', paths: unstagedFiles.value.map((f: GitStatusFile) => f.path) })
  showDiscardAllDialog.value = false
}

const cancelDiscardAll = () => {
  showDiscardAllDialog.value = false
}

const openRevertDialog = (file: GitStatusFile) => {
  commitActor?.send({ type: 'commit.TOGGLE_REVERT_DIALOG', file })
}

const confirmRevert = () => {
  commitActor?.send({ type: 'commit.REVERT_FILE', path: revertDialogFile.value!.path })
}

const cancelRevert = () => {
  commitActor?.send({ type: 'commit.TOGGLE_REVERT_DIALOG' })
}

const openFile = (file: GitStatusFile) => {
  commitActor?.send({ type: 'commit.OPEN_FILE', file })
}

const updateBranchInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  commitActor?.send({ type: 'commit.UPDATE_BRANCH_INPUT', input: target.value })
}

const checkoutBranch = () => {
  if (branchInput.value.trim() && !isCheckingOutBranch.value) {
    commitActor?.send({ type: 'commit.CHECKOUT_BRANCH' })
    showBranchDropdown.value = false
  }
}

const selectBranch = (branch: string) => {
  commitActor?.send({ type: 'commit.UPDATE_BRANCH_INPUT', input: branch })
  commitActor?.send({ type: 'commit.CHECKOUT_BRANCH' })
  showBranchDropdown.value = false
  commitActor?.send({ type: 'commit.UPDATE_BRANCH_INPUT', input: '' })
}

const startCreateBranch = () => {
  isCreatingBranch.value = true
  nextTick(() => newBranchInput.value?.focus())
}

const confirmCreateBranch = () => {
  const name = newBranchName.value.trim()
  if (!name) return
  commitActor?.send({ type: 'commit.UPDATE_BRANCH_INPUT', input: name })
  commitActor?.send({ type: 'commit.CHECKOUT_BRANCH' })
  isCreatingBranch.value = false
  newBranchName.value = ''
  commitActor?.send({ type: 'commit.UPDATE_BRANCH_INPUT', input: '' })
}

const cancelCreateBranch = () => {
  isCreatingBranch.value = false
  newBranchName.value = ''
}

const hideBranchDropdown = () => {
  // Small delay to allow click events to fire
  setTimeout(() => {
    showBranchDropdown.value = false
  }, 200)
}

// Helper functions
const getFileDisplay = (filePath: string, file?: GitStatusFile) => {
  const lastSlashIndex = filePath.lastIndexOf('/')
  const filename = lastSlashIndex === -1 ? filePath : filePath.substring(lastSlashIndex + 1)
  const directory = lastSlashIndex === -1 ? '' : filePath.substring(0, lastSlashIndex)

  if (file?.status === 'renamed' && file.originalPath) {
    const origLastSlash = file.originalPath.lastIndexOf('/')
    const origFilename = origLastSlash === -1 ? file.originalPath : file.originalPath.substring(origLastSlash + 1)
    return { filename: `${origFilename} → ${filename}`, directory }
  }

  return { filename, directory }
}

const getStatusIcon = (status: GitStatusFile['status']) => {
  switch (status) {
    case 'modified': return 'M'
    case 'added': return 'A'
    case 'deleted': return 'D'
    case 'renamed': return 'R'
    case 'untracked': return 'U'
    case 'copied': return 'C'
    case 'typechange': return 'T'
    case 'unmerged': return 'U'
    default: return '?'
  }
}

const getStatusColor = (status: GitStatusFile['status']) => {
  switch (status) {
    case 'modified': return 'text-yellow-500'
    case 'added': return 'text-green-500'
    case 'deleted': return 'text-red-500'
    case 'renamed': return 'text-blue-500'
    case 'untracked': return 'text-neutral-500'
    case 'copied': return 'text-purple-500'
    case 'typechange': return 'text-orange-500'
    case 'unmerged': return 'text-red-600'
    default: return 'text-neutral-400'
  }
}


// Trigger initial load when panel is mounted
// Git watcher will handle subsequent updates
refreshStatus()
// Also get available branches
commitActor?.send({ type: 'commit.GET_ALL_BRANCHES' })
</script>

