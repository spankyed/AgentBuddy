<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Revert Dialog -->
    <RevertDialog
      :show="!!revertDialogFile"
      :file="revertDialogFile"
      @confirm="confirmRevert"
      @cancel="cancelRevert"
    />
    <!-- Branch Info -->
    <div class="p-3 border-b border-neutral-800">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <GitBranch class="w-4 h-4 text-neutral-400" />
          <span class="text-sm font-medium">{{ gitBranch || 'unknown' }}</span>
        </div>
        <button
          @click="refreshStatus"
          :disabled="isGitLoading"
          class="p-1 transition-colors rounded hover:bg-neutral-800"
          title="Refresh"
        >
          <RefreshCw :class="['w-4 h-4 text-neutral-400', { 'animate-spin': isGitLoading }]" />
        </button>
      </div>
    </div>

    <!-- Git Error -->
    <div v-if="gitError" class="p-3 border-b border-red-800 bg-red-900/20">
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
              <span :class="getStatusColor(file.status)" class="w-4 text-xs font-medium">
                {{ getStatusIcon(file.status) }}
              </span>
              <span class="flex-1 text-sm truncate text-neutral-200">{{ file.path }}</span>
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
              :class="[
                'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors',
                selectedGitFile?.path === file.path && selectedGitFile?.staged === file.staged
                  ? 'bg-neutral-800'
                  : 'hover:bg-neutral-800/50'
              ]"
            >
              <div class="flex items-center gap-1">
                <button
                  @click.stop="stageFile(file)"
                  class="p-0.5 hover:bg-neutral-700 rounded"
                  title="Stage"
                >
                  <Plus class="w-3 h-3 text-neutral-400" />
                </button>
                <button
                  @click.stop="openRevertDialog(file)"
                  class="p-0.5 hover:bg-neutral-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Discard changes"
                >
                  <RotateCcw class="w-3 h-3 text-red-400" />
                </button>
              </div>
              <span :class="getStatusColor(file.status)" class="w-4 text-xs font-medium">
                {{ getStatusIcon(file.status) }}
              </span>
              <span class="flex-1 text-sm truncate text-neutral-200">{{ file.path }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { id, type CodeState, type GitStatusFile } from '../state'
import { GitBranch, RefreshCw, Plus, Minus, RotateCcw, FileText } from 'lucide-vue-next'
import RevertDialog from './RevertDialog.vue'

const actor: CodeState = applicationState.system.get(id)

// State selectors
const gitStatus = useSelector(actor, (state) => state.context.gitStatus)
const gitBranch = useSelector(actor, (state) => state.context.gitBranch)
const gitError = useSelector(actor, (state) => state.context.gitError)
const isGitLoading = useSelector(actor, (state) => state.context.isGitLoading)
const selectedGitFile = useSelector(actor, (state) => state.context.selectedGitFile)
const commitMessage = useSelector(actor, (state) => state.context.commitMessage)
const revertDialogFile = useSelector(actor, (state) => state.context.revertDialogFile)

// Computed
const stagedFiles = computed(() => gitStatus.value.filter(f => f.staged))
const unstagedFiles = computed(() => gitStatus.value.filter(f => !f.staged))
const canCommit = computed(() => commitMessage.value.trim() && stagedFiles.value.length > 0)

// Event handlers
const refreshStatus = () => {
  actor.send({ type: 'REFRESH_GIT_STATUS' })
}

const selectFile = (file: GitStatusFile) => {
  actor.send({ type: 'SELECT_GIT_FILE', file })
  actor.send({ type: 'VIEW_DIFF', path: file.path, staged: file.staged })
}

const stageFile = (file: GitStatusFile) => {
  actor.send({ type: 'STAGE_FILES', paths: [file.path] })
}

const unstageFile = (file: GitStatusFile) => {
  actor.send({ type: 'UNSTAGE_FILES', paths: [file.path] })
}

const updateCommitMessage = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  actor.send({ type: 'UPDATE_COMMIT_MESSAGE', message: target.value })
}

const commit = () => {
  if (canCommit.value) {
    actor.send({ type: 'COMMIT' })
  }
}

const openRevertDialog = (file: GitStatusFile) => {
  actor.send({ type: 'TOGGLE_REVERT_DIALOG', file })
}

const confirmRevert = () => {
  actor.send({ type: 'REVERT_FILE', path: revertDialogFile.value!.path })
}

const cancelRevert = () => {
  actor.send({ type: 'TOGGLE_REVERT_DIALOG' })
}

const openFile = (file: GitStatusFile) => {
  // Get the root directory from state
  const state = actor.getSnapshot()
  const rootDirectory = state.context.rootDirectory
  
  // Construct the full path
  const fullPath = rootDirectory.endsWith('/') 
    ? rootDirectory + file.path 
    : rootDirectory + '/' + file.path
  
  // First switch to explorer panel
  actor.send({ type: 'SELECT_PANEL', panel: 'explorer' })
  // Then open the file with full path
  actor.send({ type: 'OPEN_FILE', path: fullPath })
}

// Helper functions
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
</script>