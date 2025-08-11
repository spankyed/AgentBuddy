<template>
  <div class="flex flex-col h-full overflow-hidden min-w-0">
    <!-- Revert Dialog -->
    <RevertDialog
      :show="!!revertDialogFile"
      :file="revertDialogFile"
      @confirm="confirmRevert"
      @cancel="cancelRevert"
    />
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
      <div class="flex items-center gap-2">
        <GitCommit :size="16" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200">Source Control</h3>
      </div>
      <button
        @click="refreshStatus"
        :disabled="isGitLoading"
        class="p-1 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
        title="Refresh"
      >
        <RefreshCw :size="16" :class="{ 'animate-spin': isGitLoading }" />
      </button>
    </div>
    
    <!-- Show only error if no directory selected -->
    <div v-if="isNoDirectoryError" class="p-3 border-b border-red-800 bg-red-900/20">
      <div class="text-sm text-red-400">{{ gitError }}</div>
    </div>
    
    <!-- Show normal UI only when directory is selected -->
    <template v-else>
      <!-- Branch Info -->
      <div class="px-4 py-2 border-b border-neutral-800 bg-neutral-800/50">
      <div class="flex items-center gap-2">
        <GitBranch :size="14" class="text-neutral-400" />
        <span class="text-xs text-neutral-300">{{ gitBranch || 'unknown' }}</span>
      </div>
      
      <!-- Branch Checkout -->
      <div class="relative mt-2">
        <div class="relative">
          <input
            v-model="branchInput"
            @input="updateBranchInput"
            @keyup.enter="checkoutBranch"
            @focus="showBranchDropdown = true"
            @blur="hideBranchDropdown"
            :disabled="isCheckingOutBranch"
            placeholder="Switch branch or create new..."
            class="w-full px-3 py-1.5 pr-8 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 disabled:opacity-50"
          />
          <ChevronDown 
            :size="14" 
            class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
        </div>
        
        <!-- Custom Dropdown -->
        <div 
          v-if="showBranchDropdown && (filteredBranches.length > 0 || branchInput.trim())"
          class="absolute z-10 w-full mt-1 bg-neutral-900 border border-neutral-700 rounded shadow-lg max-h-48 overflow-y-auto"
        >
          <!-- Create new branch option -->
          <div 
            v-if="branchInput.trim() && !availableBranches.includes(branchInput.trim())"
            @mousedown.prevent="selectBranch(branchInput.trim())"
            class="px-3 py-2 hover:bg-neutral-800 cursor-pointer flex items-center gap-2"
          >
            <GitBranch :size="12" class="text-green-500" />
            <span class="text-xs text-neutral-300">Create new branch: <span class="font-medium text-green-400">{{ branchInput }}</span></span>
          </div>
          
          <!-- Existing branches -->
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
        <label class="text-sm text-neutral-400">Commit Message</label>
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
      <div v-if="gitStatus.length === 0" class="p-4 text-sm text-center text-neutral-500">
        No changes to commit
      </div>
      
      <div v-else class="divide-y divide-neutral-800">
        <!-- Staged Changes -->
        <div v-if="stagedFiles.length > 0" class="p-3">
          <div class="mb-2 text-xs font-medium text-neutral-400">STAGED CHANGES</div>
          <div class="space-y-1">
            <div
              v-for="file in stagedFiles"
              :key="`staged-${file.path}`"
              @click="selectFile(file)"
              :title="file.path"
              :class="[
                'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors',
                selectedGitFile?.path === file.path && selectedGitFile?.staged === file.staged
                  ? 'bg-neutral-800'
                  : 'hover:bg-neutral-800/50'
              ]"
            >
              <button
                @click.stop="unstageFile(file)"
                class="p-0.5 hover:bg-neutral-700 rounded"
                title="Unstage"
              >
                <Minus class="w-3 h-3 text-neutral-400" />
              </button>
              <div class="flex-1 min-w-0 flex items-center gap-2">
                <span class="text-sm font-medium text-neutral-200">{{ formatFilePath(file.path).filename }}</span>
                <span v-if="formatFilePath(file.path).directory" class="text-xs text-neutral-500 truncate">
                  {{ formatFilePath(file.path).directory }}
                </span>
              </div>
              <span :class="getStatusColor(file.status)" class="w-4 text-xs font-medium">
                {{ getStatusIcon(file.status) }}
              </span>
              <button
                @click.stop="openFile(file)"
                class="p-0.5 hover:bg-neutral-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Open file"
              >
                <FileText class="w-3 h-3 text-neutral-400" />
              </button>
            </div>
          </div>
        </div>

        <!-- Unstaged Changes -->
        <div v-if="unstagedFiles.length > 0" class="p-3">
          <div class="mb-2 text-xs font-medium text-neutral-400">CHANGES</div>
          <div class="space-y-1">
            <div
              v-for="file in unstagedFiles"
              :key="`unstaged-${file.path}`"
              @click="selectFile(file)"
              :title="file.path"
              :class="[
                'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors',
                selectedGitFile?.path === file.path && selectedGitFile?.staged === file.staged
                  ? 'bg-neutral-800'
                  : 'hover:bg-neutral-800/50'
              ]"
            >
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  @click.stop="stageFile(file)"
                  class="p-0.5 hover:bg-neutral-700 rounded"
                  title="Stage"
                >
                  <Plus class="w-3 h-3 text-neutral-400" />
                </button>
                <button
                  @click.stop="openRevertDialog(file)"
                  class="p-0.5 hover:bg-neutral-700 rounded"
                  title="Discard changes"
                >
                  <RotateCcw class="w-3 h-3 text-red-400" />
                </button>
              </div>
              <div class="flex-1 min-w-0 flex items-center gap-2">
                <span class="text-sm font-medium text-neutral-200">{{ formatFilePath(file.path).filename }}</span>
                <span v-if="formatFilePath(file.path).directory" class="text-xs text-neutral-500 truncate">
                  {{ formatFilePath(file.path).directory }}
                </span>
              </div>
              <span :class="getStatusColor(file.status)" class="w-4 text-xs font-medium">
                {{ getStatusIcon(file.status) }}
              </span>
              <button
                @click.stop="openFile(file)"
                class="p-0.5 hover:bg-neutral-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Open file"
              >
                <FileText class="w-3 h-3 text-neutral-400" />
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
import { computed, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import { GitBranch, GitCommit, RefreshCw, Plus, Minus, RotateCcw, FileText, ChevronDown, CheckCircle } from 'lucide-vue-next'
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

// Local state
const showBranchDropdown = ref(false)

// Computed
const stagedFiles = computed(() => gitStatus.value.filter((f: any) => f.staged))
const unstagedFiles = computed(() => gitStatus.value.filter((f: any) => !f.staged))
const canCommit = computed(() => commitMessage.value.trim() && stagedFiles.value.length > 0)

const isNoDirectoryError = computed(() => {
  return gitError.value?.includes('No directory selected')
})

const shouldShowActionButton = computed(() => {
  // Show action button when:
  // 1. No upstream (publish) or
  // 2. Has upstream and commits ahead (push) or
  // 3. Has upstream and commits behind (pull)
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
}

const hideBranchDropdown = () => {
  // Small delay to allow click events to fire
  setTimeout(() => {
    showBranchDropdown.value = false
  }, 200)
}

// Helper functions
const formatFilePath = (path: string) => {
  const lastSlashIndex = path.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    // No directory, just filename
    return { filename: path, directory: '' }
  }
  
  const filename = path.substring(lastSlashIndex + 1)
  const directory = path.substring(0, lastSlashIndex)
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