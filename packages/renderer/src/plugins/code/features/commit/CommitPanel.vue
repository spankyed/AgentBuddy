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
    <EmptyState
      v-if="isNoGitRepoError"
      :icon="GitBranch"
      title="No Git Repository"
      subtitle="Open a folder with a git repository to use source control features"
    />

    <!-- Show error if no directory selected -->
    <NoDirectoryState v-else-if="!baseDirectory" />

    <!-- Show normal UI only when directory is selected and has git -->
    <template v-else>
      <!-- Branch Info -->
      <div class="px-4 py-2 border-b border-neutral-800 bg-neutral-800/50">
      <!-- Create Branch Mode -->
      <div v-if="isCreatingBranch" class="flex items-center gap-1.5">
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
      <div v-else class="relative flex items-center gap-1.5">
        <div class="relative flex-1 min-w-0">
          <GitBranch
            :size="12"
            class="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
          <input
            v-model="branchInput"
            @input="updateBranchInput"
            @keyup.enter="checkoutBranch"
            @focus="showBranchDropdown = true"
            @blur="hideBranchDropdown"
            :disabled="isCheckingOutBranch"
            :placeholder="gitBranch || 'Select branch...'"
            class="w-full pl-7 pr-8 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 disabled:opacity-50"
          />
          <ChevronDown
            :size="14"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
        </div>
        <button
          @click="startCreateBranch"
          class="p-1 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
          title="Create new branch"
        >
          <GitBranchPlus :size="14" />
        </button>
        <button
          @click="commitsAhead > 0 ? commitActor?.send({ type: 'commit.PUSH_BRANCH' }) : commitActor?.send({ type: 'commit.PULL_BRANCH' })"
          :disabled="isPulling || isPushing || !hasUpstream"
          class="relative p-1 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :title="commitsAhead > 0 ? 'Push' : 'Pull latest'"
        >
          <Loader2 v-if="isPulling || isPushing" :size="14" class="animate-spin" />
          <ArrowUpFromLine v-else-if="commitsAhead > 0" :size="14" />
          <ArrowDownToLine v-else :size="14" />
          <span
            v-if="commitsAhead > 0"
            class="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 text-[9px] font-bold leading-none text-white bg-green-600 rounded-full"
          >{{ commitsAhead }}</span>
          <span
            v-else-if="commitsBehind > 0"
            class="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 text-[9px] font-bold leading-none text-white bg-blue-600 rounded-full"
          >{{ commitsBehind }}</span>
        </button>

        <!-- Sync feedback popover -->
        <Transition name="sync-feedback">
          <div
            v-if="syncFeedback"
            class="absolute top-full mt-1 right-0 px-2 py-1 text-[11px] font-medium rounded shadow-lg whitespace-nowrap pointer-events-none z-20"
            :class="syncFeedback.includes('Already') || syncFeedback.includes('Nothing')
              ? 'text-neutral-300 bg-neutral-800 border border-neutral-700'
              : 'text-green-300 bg-green-900/90 border border-green-800/60'"
          >
            {{ syncFeedback }}
          </div>
        </Transition>

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
      <div class="flex items-start gap-2">
        <div
          ref="errorContentRef"
          class="flex-1 text-sm text-red-400 whitespace-pre-wrap break-words"
          :class="{ 'max-h-24 overflow-hidden': !isErrorExpanded }"
        >{{ gitError }}</div>
        <button
          @click="dismissError"
          class="shrink-0 p-0.5 rounded text-red-400 hover:text-red-200 hover:bg-red-900/40 transition-colors"
          title="Dismiss"
        >
          <X :size="14" />
        </button>
      </div>
      <button
        v-if="isErrorOverflowing"
        @click="isErrorExpanded = !isErrorExpanded"
        class="mt-1 text-xs text-red-500 hover:text-red-300 transition-colors"
      >{{ isErrorExpanded ? 'View less' : 'View more' }}</button>
    </div>

    <!-- Commit Message -->
    <div class="px-4 py-3 border-b border-neutral-800">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1">
            <div class="relative -ml-1">
              <button
                @click="showStashMenu = !showStashMenu"
                @blur="hideStashMenu"
                :disabled="gitStatus.length === 0 && !isStashing"
                class="p-1 rounded transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                title="More actions"
              >
                <Loader2 v-if="isStashing" :size="14" class="animate-spin" />
                <MoreVertical v-else :size="14" />
              </button>
              <div
                v-if="showStashMenu"
                class="absolute left-0 z-10 mt-1 w-44 bg-neutral-900 border border-neutral-700 rounded shadow-lg"
              >
                <button
                  @mousedown.prevent="stashAll"
                  class="w-full px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Stash All Changes
                </button>
                <button
                  @mousedown.prevent="stashStaged"
                  :disabled="stagedFiles.length === 0"
                  class="w-full px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Stash Staged Only
                </button>
              </div>
            </div>
            <label class="text-sm text-neutral-400">Commit Message</label>
          </div>
          <button
            disabled
            class="p-1 rounded transition-colors text-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Out of order"
          >
            <Sparkles :size="14" />
          </button>
        </div>
        <textarea
          v-model="commitMessage"
          @input="updateCommitMessage"
          :placeholder="`Message (currently on ${gitBranch || 'unknown'})`"
          class="w-full px-3 py-2 text-sm border rounded resize-none bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 commit-message"
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
      <EmptyState
        v-if="gitStatus.length === 0"
        :icon="GitCommit"
        title="No changes to commit"
        subtitle="Working tree is clean"
      />

      <div v-else class="divide-y divide-neutral-800">
        <!-- Staged Changes -->
        <div v-if="stagedFiles.length > 0" class="p-3">
          <div class="flex items-center justify-between mb-2 px-2">
            <span class="text-xs font-medium text-neutral-400">STAGED CHANGES</span>
            <button @click="unstageAll" class="p-0.5 hover:bg-neutral-700 rounded" title="Unstage All">
              <Minus class="w-3 h-3 text-neutral-400" />
            </button>
          </div>
          <div class="space-y-1">
            <TrackedContextMenuRoot v-for="file in stagedFiles" :key="`staged-${file.path}`">
              <ContextMenuTrigger as-child>
                <div
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
                    <span class="text-sm font-medium text-neutral-200 truncate">{{ getFileDisplay(file.path, file).filename }}</span>
                    <span v-if="getFileDisplay(file.path, file).directory" dir="rtl" class="text-xs text-neutral-500 truncate">
                      {{ getFileDisplay(file.path, file).directory }}
                    </span>
                  </div>
                  <span :class="getStatusColor(file.status)" class="flex-shrink-0 w-4 text-xs font-medium">
                    {{ getStatusIcon(file.status) }}
                  </span>
                  <button
                    v-if="file.status !== 'deleted'"
                    @click.stop="openFile(file)"
                    class="p-0.5 hover:bg-neutral-700 rounded"
                    title="Open file"
                  >
                    <File class="w-3 h-3 text-neutral-400" />
                  </button>
                  <button @click.stop="unstageFile(file)" class="p-0.5 hover:bg-neutral-700 rounded" title="Unstage">
                    <Minus class="w-3 h-3 text-neutral-400" />
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuPortal>
                <ContextMenuContent :class="MENU_CONTENT_CLASS">
                  <ContextMenuItem v-if="file.status !== 'deleted'" @select="openFile(file)" :class="MENU_ITEM_CLASS">
                    <File class="w-4 h-4" /> Open File
                  </ContextMenuItem>
                  <ContextMenuItem @select="copyPath(file.path)" :class="MENU_ITEM_CLASS">
                    <Copy class="w-4 h-4" /> Copy Path
                  </ContextMenuItem>
                  <ContextMenuItem @select="copyRelativePath(file.path)" :class="MENU_ITEM_CLASS">
                    <Copy class="w-4 h-4" /> Copy Relative Path
                  </ContextMenuItem>
                  <ContextMenuSeparator :class="MENU_SEPARATOR_CLASS" />
                  <ContextMenuItem @select="unstageFile(file)" :class="MENU_ITEM_CLASS">
                    <Minus class="w-4 h-4" /> Unstage
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenuPortal>
            </TrackedContextMenuRoot>
          </div>
        </div>

        <!-- Unstaged Changes -->
        <div v-if="unstagedFiles.length > 0" class="p-3">
          <div class="flex items-center justify-between mb-2 px-2">
            <span class="text-xs font-medium text-neutral-400">CHANGES</span>
            <div class="flex items-center gap-2">
              <button @click="openDiscardAllDialog" class="p-0.5 hover:bg-neutral-700 rounded" title="Discard All Changes">
                <RotateCcw class="w-3 h-3 text-red-400" />
              </button>
              <button @click="stageAll" class="p-0.5 hover:bg-neutral-700 rounded" title="Stage All Changes">
                <Plus class="w-3 h-3 text-neutral-400" />
              </button>
            </div>
          </div>
          <div class="space-y-1">
            <TrackedContextMenuRoot v-for="file in unstagedFiles" :key="`unstaged-${file.path}`">
              <ContextMenuTrigger as-child>
                <div
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
                    <span class="text-sm font-medium text-neutral-200 truncate">{{ getFileDisplay(file.path, file).filename }}</span>
                    <span v-if="getFileDisplay(file.path, file).directory" dir="rtl" class="text-xs text-neutral-500 truncate">
                      {{ getFileDisplay(file.path, file).directory }}
                    </span>
                  </div>
                  <span :class="getStatusColor(file.status)" class="flex-shrink-0 w-4 text-xs font-medium">
                    {{ getStatusIcon(file.status) }}
                  </span>
                  <button
                    v-if="file.status !== 'deleted'"
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
              </ContextMenuTrigger>
              <ContextMenuPortal>
                <ContextMenuContent :class="MENU_CONTENT_CLASS">
                  <ContextMenuItem v-if="file.status !== 'deleted'" @select="openFile(file)" :class="MENU_ITEM_CLASS">
                    <File class="w-4 h-4" /> Open File
                  </ContextMenuItem>
                  <ContextMenuItem @select="copyPath(file.path)" :class="MENU_ITEM_CLASS">
                    <Copy class="w-4 h-4" /> Copy Path
                  </ContextMenuItem>
                  <ContextMenuItem @select="copyRelativePath(file.path)" :class="MENU_ITEM_CLASS">
                    <Copy class="w-4 h-4" /> Copy Relative Path
                  </ContextMenuItem>
                  <ContextMenuSeparator :class="MENU_SEPARATOR_CLASS" />
                  <ContextMenuItem @select="stageFile(file)" :class="MENU_ITEM_CLASS">
                    <Plus class="w-4 h-4" /> Stage
                  </ContextMenuItem>
                  <ContextMenuItem @select="openRevertDialog(file)" :class="MENU_ITEM_DANGER_CLASS">
                    <RotateCcw class="w-4 h-4" /> Discard Changes
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenuPortal>
            </TrackedContextMenuRoot>
          </div>
        </div>
      </div>
    </div>

    <!-- Stashes Section (pinned to bottom) -->
    <div v-if="stashList.length > 0" class="flex-shrink-0 border-t border-neutral-800">
      <div class="flex items-center justify-between p-3 px-5 cursor-pointer hover:bg-neutral-800/60 transition-colors" @click="isStashesExpanded = !isStashesExpanded">
        <div class="flex items-center gap-1 text-xs font-medium text-neutral-400">
          <ChevronRight v-if="!isStashesExpanded" class="w-3 h-3" />
          <ChevronDown v-else class="w-3 h-3" />
          STASHES ({{ stashList.length }})
        </div>
        <button @click.stop="openClearStashesDialog" class="p-0.5 hover:bg-neutral-700 rounded" title="Clear All Stashes">
          <Trash2 class="w-3 h-3 text-gray-400" />
        </button>
      </div>
      <div v-if="isStashesExpanded" class="overflow-y-auto max-h-48 pb-3">
        <div class="space-y-0.5 pl-3">
          <div
            v-for="stash in stashList"
            :key="stash.ref"
            class="group px-2 py-1.5 rounded hover:bg-neutral-800/50 transition-colors cursor-pointer"
            @click="applyStash(stash.index)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <div class="flex-1 min-w-0">
                <div class="text-xs text-neutral-200 truncate">{{ formatStashMessage(stash) }}</div>
                <div class="text-[11px] text-neutral-500 truncate">{{ stash.ref }} · {{ formatStashBranch(stash.message) }} · {{ formatStashDate(stash.date) }}</div>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button @click.stop="copyStashMessage(stash)" class="p-0.5 hover:bg-neutral-700 rounded" title="Copy message">
                  <Copy class="w-3 h-3 text-neutral-400" />
                </button>
                <button @click.stop="popStash(stash.index)" class="p-0.5 hover:bg-neutral-700 rounded" title="Pop (apply & remove)">
                  <ArrowDownToLine class="w-3 h-3 text-neutral-400" />
                </button>
                <button @click.stop="openDropStashDialog(stash.index)" class="p-0.5 hover:bg-neutral-700 rounded" title="Drop">
                  <Trash2 class="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Drop Stash Dialog -->
    <RevertDialog
      :show="showDropStashDialog"
      :file="null"
      :customTitle="'Drop Stash'"
      :customMessage="'Are you sure you want to drop this stash? This action cannot be undone.'"
      @confirm="confirmDropStash"
      @cancel="cancelDropStash"
    />

    <!-- Clear All Stashes Dialog -->
    <RevertDialog
      :show="showClearStashesDialog"
      :file="null"
      :customTitle="'Clear All Stashes'"
      :customMessage="'Are you sure you want to clear all stashes? This action cannot be undone.'"
      @confirm="confirmClearStashes"
      @cancel="cancelClearStashes"
    />

    <ToastNotification ref="toast" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import { GitBranch, GitBranchPlus, GitCommit, RefreshCw, Plus, Minus, RotateCcw, File, ChevronDown, ChevronRight, CheckCircle, Check, X, Sparkles, Loader2, ArrowDownToLine, ArrowUpFromLine, MoreVertical, Trash2, Copy } from 'lucide-vue-next'
import { ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuSeparator } from 'reka-ui'
import TrackedContextMenuRoot from '@/core/components/design/TrackedContextMenuRoot.vue'
import { MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MENU_CONTENT_CLASS, MENU_SEPARATOR_CLASS } from '@/plugins/code/features/explorer/constants'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import NoDirectoryState from '@/plugins/code/features/NoDirectoryState.vue'
import EmptyState from '@/plugins/code/features/EmptyState.vue'
import RevertDialog from '@/plugins/code/features/commit/RevertDialog.vue'
import ToastNotification from '@/core/components/design/ToastNotification.vue'

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
const stashList = useSelector(commitActor, (state: any) => state.context.stashList)
const isStashing = useSelector(commitActor, (state: any) => state.context.isStashing)
const baseDirectory = useSelector(codeActor, (state) => state.context.baseDirectory)

// Local state
const showDiscardAllDialog = ref(false)
const showBranchDropdown = ref(false)
const isCreatingBranch = ref(false)
const newBranchName = ref('')
const newBranchInput = ref<HTMLInputElement | null>(null)
const showStashMenu = ref(false)
const isStashesExpanded = ref(false)
const showDropStashDialog = ref(false)
const pendingDropIndex = ref<number | null>(null)
const showClearStashesDialog = ref(false)
const isErrorExpanded = ref(false)
const errorContentRef = ref<HTMLElement | null>(null)
const isErrorOverflowing = ref(false)
const toast = ref<InstanceType<typeof ToastNotification>>()
const syncFeedback = ref<string | null>(null)
let syncClearTimer: ReturnType<typeof setTimeout> | undefined

const showSyncFeedback = (message: string) => {
  syncFeedback.value = message
  clearTimeout(syncClearTimer)
  syncClearTimer = setTimeout(() => { syncFeedback.value = null }, 1500)
}

const watchSyncOp = (
  flag: typeof isPulling,
  getCount: () => number,
  label: string,
  noopMessage: string
) => {
  let snapshotCount = 0
  watch(flag, (active, wasActive) => {
    if (active) {
      snapshotCount = getCount()
      clearTimeout(syncClearTimer)
      syncFeedback.value = null
    } else if (wasActive) {
      if (gitError.value) {
        toast.value?.error(`${label} failed`, gitError.value)
      } else {
        showSyncFeedback(snapshotCount > 0
          ? `${label}ed ${snapshotCount} commit${snapshotCount !== 1 ? 's' : ''}`
          : noopMessage)
      }
    }
  })
}

const dismissError = () => {
  commitActor.send({ type: 'commit.DISMISS_ERROR' })
  isErrorExpanded.value = false
}

watch(gitError, () => {
  isErrorExpanded.value = false
  nextTick(() => {
    const el = errorContentRef.value
    if (el) {
      isErrorOverflowing.value = el.scrollHeight > el.clientHeight
    } else {
      isErrorOverflowing.value = false
    }
  })
})

watchSyncOp(isPulling, () => commitsBehind.value, 'Pull', 'Already up to date')
watchSyncOp(isPushing, () => commitsAhead.value, 'Push', 'Nothing to push')

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

const copyPath = async (path: string) => {
  try { await navigator.clipboard.writeText(path) } catch (err) { console.error('Failed to copy path:', err) }
}

const copyRelativePath = async (path: string) => {
  try {
    const base = baseDirectory.value
    let rel = path
    if (base && rel.startsWith(base)) {
      rel = rel.slice(base.length)
      if (rel.startsWith('/')) rel = rel.slice(1)
    }
    await navigator.clipboard.writeText(rel)
  } catch (err) { console.error('Failed to copy path:', err) }
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

// Stash handlers
const hideStashMenu = () => {
  setTimeout(() => {
    showStashMenu.value = false
  }, 200)
}

const stashAll = () => {
  showStashMenu.value = false
  commitActor?.send({ type: 'commit.STASH_PUSH', message: commitMessage.value || undefined, stagedOnly: false })
}

const stashStaged = () => {
  showStashMenu.value = false
  commitActor?.send({ type: 'commit.STASH_PUSH', message: commitMessage.value || undefined, stagedOnly: true })
}

const applyStash = (index: number) => {
  commitActor?.send({ type: 'commit.STASH_APPLY', index })
}

const popStash = (index: number) => {
  commitActor?.send({ type: 'commit.STASH_POP', index })
}

const copyStashMessage = (stash: any) => {
  const message = formatStashMessage(stash)
  navigator.clipboard.writeText(message)
}

const openDropStashDialog = (index: number) => {
  pendingDropIndex.value = index
  showDropStashDialog.value = true
}

const confirmDropStash = () => {
  if (pendingDropIndex.value !== null) {
    commitActor?.send({ type: 'commit.STASH_DROP', index: pendingDropIndex.value })
  }
  showDropStashDialog.value = false
  pendingDropIndex.value = null
}

const cancelDropStash = () => {
  showDropStashDialog.value = false
  pendingDropIndex.value = null
}

const openClearStashesDialog = () => {
  showClearStashesDialog.value = true
}

const confirmClearStashes = () => {
  commitActor?.send({ type: 'commit.STASH_CLEAR' })
  showClearStashesDialog.value = false
}

const cancelClearStashes = () => {
  showClearStashesDialog.value = false
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


const formatStashMessage = (stash: any) => {
  if (stash.message) {
    // Strip the "On branch: " or "WIP on branch:" prefix that git adds
    const cleaned = stash.message
      .replace(/^On \S+:\s*/, '')
      .replace(/^WIP on \S+\s*/, '')
    return cleaned || `stash@{${stash.index}}`
  }
  return `stash@{${stash.index}}`
}

const formatStashBranch = (message: string) => {
  // Extract branch name from "On branch:" or "WIP on branch" prefix
  const match = message?.match(/^(?:On|WIP on)\s+(\S+?)[:,\s]/)
  return match ? match[1] : 'unknown'
}

const formatStashDate = (dateStr: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Trigger initial load when panel is mounted
// Git watcher will handle subsequent updates
refreshStatus()
// Also get available branches and stash list
commitActor?.send({ type: 'commit.GET_ALL_BRANCHES' })
commitActor?.send({ type: 'commit.STASH_LIST' })
</script>

<style scoped>
.commit-message::placeholder {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sync-feedback-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.sync-feedback-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.sync-feedback-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.sync-feedback-leave-to {
  opacity: 0;
  transform: translateY(2px);
}
</style>

