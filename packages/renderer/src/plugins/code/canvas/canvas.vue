<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Quick Open Palette -->
    <QuickOpenPalette />
    
    <!-- Always use FileEditor which now handles both regular files and diffs -->
    <FileEditor
      :open-files="openFiles"
      :active-file-path="activeFilePath"
      :root-directory="rootDirectory"
      :tab-groups="tabGroups"
      @select-file="selectFile"
      @close-file="closeFile"
      @content-change="handleContentChange"
      @reorder="handleReorder"
      @reveal-in-explorer="revealInExplorer"
      @pin-tab="pinTab"
      @unpin-tab="unpinTab"
      @create-group="createGroup"
      @rename-group="renameGroup"
      @change-group-color="changeGroupColor"
      @delete-group="deleteGroup"
      @toggle-group-collapse="toggleGroupCollapse"
      @add-tab-to-group="addTabToGroup"
      @remove-tab-from-group="removeTabFromGroup"
      @ungroup-all="ungroupAll"
      @close-all-in-group="closeAllInGroup"
      @pin-group="pinGroup"
      @unpin-group="unpinGroup"
      class="flex-1 min-h-0"
    />

    <!-- Status Bar -->
    <div v-if="openFiles.length > 0" class="flex items-center justify-between px-4 py-1 text-xs border-t bg-neutral-800/80 border-neutral-800">
      <div class="flex items-center gap-4">
        <span v-if="activeFile" class="flex items-center gap-2 text-neutral-400">
          <component :is="getStatusIcon(activeFile)" class="w-3 h-3" />
          {{ getStatusText(activeFile) }}
        </span>
        <span v-if="activeFile && !isTerminal(activeFile) && activeFile.pendingSaveConflict && !activeFile.isDiff" class="text-orange-400">
          External changes detected
        </span>
        <span v-else-if="activeFile && !isTerminal(activeFile) && activeFile.modified && !activeFile.isDiff" class="text-blue-400">
          Modified
        </span>
        <span v-if="refreshNotification" class="text-green-400 animate-pulse">
          File refreshed
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="activeFile && !isTerminal(activeFile) && activeFile.pendingSaveConflict && !activeFile.isDiff && !isAction(activeFile) && !isPrompt(activeFile)"
          @click="loadExternalChanges"
          class="px-2 py-0.5 bg-neutral-600 hover:bg-neutral-700 text-white rounded transition-colors"
        >
          Load Changes
        </button>
        <button
          v-if="activeFile && !isTerminal(activeFile) && activeFile.modified && !activeFile.isDiff"
          @click="() => saveFile()"
          class="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          {{ activeFile.pendingSaveConflict ? 'Override' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from '../state'
import { GitCompare, FileCode, Terminal } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import FileEditor from '@/plugins/code/canvas/FileEditor.vue'
import QuickOpenPalette from '@/plugins/code/canvas/QuickOpenPalette.vue'
import { reorderTabs } from '../utils/tab-management'

const actor: CodeState = applicationState.system.get(id)
const explorerActor = actor.system.get('explorer')
const actionsActor = actor.system.get('codeActions')
const promptsActor = actor.system.get('codePrompts')
const settingsActor = applicationState.system.get('settings')

// Terminal outputs are handled through state

// State selectors
const openFiles = useSelector(actor, (state) => state.context.openFiles)
const activeFilePath = useSelector(actor, (state) => state.context.activeFilePath)
const rootDirectory = useSelector(actor, (state) => state.context.rootDirectory)
const tabGroups = useSelector(actor, (state) => state.context.tabGroups)
const confirmTerminalClose = useSelector(settingsActor, (state: any) => state.context.settings?.plugins?.code?.confirmTerminalClose ?? true)

// Computed
const activeFile = computed(() => 
  openFiles.value.find(f => f.path === activeFilePath.value)
)

// Notification state
const refreshNotification = ref(false)
let refreshTimeout: number | undefined

// Watch for external file refreshes
watch(openFiles, (newFiles, oldFiles) => {
  if (!oldFiles || !newFiles) return
  
  // Check if any file was refreshed (externallyModified cleared)
  for (const newFile of newFiles) {
    const oldFile = oldFiles.find(f => f.path === newFile.path)
    if (oldFile && oldFile.externallyModified && !newFile.externallyModified && !newFile.modified) {
      // File was refreshed
      showRefreshNotification()
      break
    }
  }
}, { deep: true })

const showRefreshNotification = () => {
  refreshNotification.value = true
  if (refreshTimeout) {
    clearTimeout(refreshTimeout)
  }
  refreshTimeout = window.setTimeout(() => {
    refreshNotification.value = false
  }, 3000)
}

// Event handlers
const selectFile = (path: string) => {
  actor.send({ 
    type: 'UPDATE_STATE', 
    updates: { activeFilePath: path } 
  })
}

const closeFile = (path: string) => {
  const file = openFiles.value.find(f => f.path === path)
  const isTerminal = file && 'isTerminal' in file && file.isTerminal

  // Check if terminal close needs confirmation
  if (isTerminal && confirmTerminalClose.value) {
    const terminalInfo = (file as any).terminalInfo
    const displayName = terminalInfo?.customTitle || terminalInfo?.title || 'Terminal'
    if (!confirm(`Close terminal "${displayName}"?`)) return
  }

  const newOpenFiles = openFiles.value.filter(f => f.path !== path)
  const newActiveFilePath = activeFilePath.value === path
    ? (newOpenFiles.length > 0 ? newOpenFiles[0].path : null)
    : activeFilePath.value

  actor.send({
    type: 'UPDATE_STATE',
    updates: { openFiles: newOpenFiles, activeFilePath: newActiveFilePath }
  })

  explorerActor?.send({ type: 'explorer.CLOSE_FILE', path })
}

const handleContentChange = (path: string, content: string) => {
  const newOpenFiles = openFiles.value.map(f => 
    f.path === path ? { ...f, content, modified: true } : f
  )
  
  actor.send({ 
    type: 'UPDATE_STATE',
    updates: { openFiles: newOpenFiles }
  })
}

const handleReorder = (fromIndex: number, toIndex: number) => {
  const reorderedFiles = reorderTabs(openFiles.value, fromIndex, toIndex)
  
  actor.send({
    type: 'UPDATE_STATE',
    updates: { openFiles: reorderedFiles }
  })
}

const saveFile = async () => {
  if (activeFile.value && !activeFile.value.isDiff) {
    if (isAction(activeFile.value)) {
      // Send event to actions state machine for action files
      const actionId = activeFile.value.path.replace('action:', '')
      actionsActor?.send({
        type: 'codeActions.SAVE_ACTION',
        actionId: actionId,
        content: activeFile.value.content
      })
    } else if (isPrompt(activeFile.value)) {
      // Send event to prompts state machine for prompt files
      const promptId = activeFile.value.path.replace('prompt:', '')
      promptsActor?.send({
        type: 'codePrompts.SAVE_PROMPT',
        promptId: promptId,
        content: activeFile.value.content
      })
    } else {
      // Send event to explorer state machine for regular files
      explorerActor?.send({
        type: 'explorer.WRITE_FILE',
        path: activeFile.value.path,
        content: activeFile.value.content
      })
    }
  }
}

const loadExternalChanges = () => {
  if (activeFile.value && activeFile.value.pendingSaveConflict) {
    // Send event to explorer state machine
    explorerActor?.send({
      type: 'explorer.OPEN_FILE',
      path: activeFile.value.path
    })
  }
}

// Helper functions
const getFileName = (path: string) => {
  return path.split('/').pop() || path
}

const isTerminal = (file: any): boolean => {
  return 'isTerminal' in file && file.isTerminal === true
}

const isAction = (file: any): boolean => {
  return 'isAction' in file && file.isAction === true
}

const isPrompt = (file: any): boolean => {
  return 'isPrompt' in file && file.isPrompt === true
}

const getStatusIcon = (file: any) => {
  if (isTerminal(file)) return Terminal
  if (file.isDiff) return GitCompare
  if (isAction(file)) return FileCode // Actions use same icon as files
  if (isPrompt(file)) return FileCode // Prompts use same icon as files
  return FileCode
}

const getStatusText = (file: any) => {
  if (isTerminal(file)) {
    return file.terminalInfo.title
  }
  if (file.isDiff && file.gitFile) {
    return getFileName(file.gitFile.path)
  }
  if (isAction(file)) {
    return file.actionEntity.label
  }
  if (isPrompt(file)) {
    return file.promptEntity.label
  }
  return getFileName(file.path)
}

const revealInExplorer = (path: string) => {
  // Switch to explorer panel
  actor.send({ type: 'SELECT_PANEL', panel: 'explorer' })
  
  // Get the directory of the file
  const directory = path.substring(0, path.lastIndexOf('/'))
  
  // Navigate to the file's directory in the explorer
  explorerActor?.send({ 
    type: 'explorer.NAVIGATE_TO_DIRECTORY', 
    path: directory 
  })
}

const pinTab = (path: string) => {
  actor.send({ type: 'PIN_TAB', path })
}

const unpinTab = (path: string) => {
  actor.send({ type: 'UNPIN_TAB', path })
}

// Tab group handlers
const createGroup = (name: string, tabPaths: string[]) => {
  actor.send({ type: 'CREATE_GROUP', name, tabPaths })
}

const renameGroup = (groupId: string, name: string) => {
  actor.send({ type: 'RENAME_GROUP', groupId, name })
}

const changeGroupColor = (groupId: string, color: string) => {
  actor.send({ type: 'CHANGE_GROUP_COLOR', groupId, color: color as any })
}

const deleteGroup = (groupId: string) => {
  actor.send({ type: 'DELETE_GROUP', groupId, closeTabsInGroup: false })
}

const toggleGroupCollapse = (groupId: string) => {
  actor.send({ type: 'TOGGLE_GROUP_COLLAPSE', groupId })
}

const addTabToGroup = (path: string, groupId: string) => {
  actor.send({ type: 'ADD_TAB_TO_GROUP', path, groupId })
}

const removeTabFromGroup = (path: string) => {
  actor.send({ type: 'REMOVE_TAB_FROM_GROUP', path })
}

const ungroupAll = (groupId: string) => {
  actor.send({ type: 'DELETE_GROUP', groupId, closeTabsInGroup: false })
}

const closeAllInGroup = (groupId: string) => {
  actor.send({ type: 'DELETE_GROUP', groupId, closeTabsInGroup: true })
}

const pinGroup = (groupId: string) => {
  actor.send({ type: 'PIN_GROUP', groupId })
}

const unpinGroup = (groupId: string) => {
  actor.send({ type: 'UNPIN_GROUP', groupId })
}

// Keyboard shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  // Quick Open: Cmd/Ctrl + P
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    e.preventDefault()
    actor.send({ type: 'SHOW_QUICK_OPEN' })
  }
  
  // Save file: Cmd/Ctrl + S
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    if (activeFile.value && activeFile.value.modified && !activeFile.value.isDiff) {
      saveFile()
    }
  }
  
  // Close tab: Cmd/Ctrl + W
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault()
    if (activeFilePath.value) {
      closeFile(activeFilePath.value)
    }
  }
}

// Terminal output is handled through state management

// Add keyboard event listener on mount
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (refreshTimeout) {
    clearTimeout(refreshTimeout)
  }
})
</script>

<style>
.bg-neutral-850 {
  background-color: rgb(28, 28, 30);
}
</style>