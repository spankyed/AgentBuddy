<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="flex items-center gap-1 p-2 border-b border-neutral-800">
      <button
        v-for="panel in panels"
        :key="panel.id"
        @click="selectPanel(panel.id)"
        :class="[
          'p-1.5 rounded transition-colors',
          selectedPanel === panel.id
            ? 'bg-primary-700 text-neutral-100'
            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
        ]"
        :title="panel.label"
      >
        <component :is="panel.icon" class="w-4 h-4" />
      </button>
    </div>

    <!-- Panel Content -->
    <div class="flex-1 overflow-hidden">
      <ExplorerPanel
        v-if="selectedPanel === 'explorer'"
        :root-directory="rootDirectory"
        :current-directory="currentDirectory"
        :files="files"
        :is-loading="isLoading"
        :error="error"
        @navigate-to-directory="navigateToDirectory"
        @set-root-directory="setRootDirectory"
        @file-click="handleFileClick"
        @rename-file="handleRenameFile"
        @delete-file="handleDeleteFile"
      />
      
      <SearchPanel v-else-if="selectedPanel === 'search'" />
      
      <CommitPanel v-else-if="selectedPanel === 'commit'" />
      
      <PullRequestPanel v-else-if="selectedPanel === 'pr'" />
      
      <TerminalPanel v-else-if="selectedPanel === 'terminal'" />
    </div>

    <!-- Change Directory Button -->
    <div class="p-2 border-t border-neutral-800">
      <button
        @click="changeDirectory"
        class="w-full px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
      >
        Change Directory
      </button>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from './state'
import { 
  FolderOpen, 
  Search, 
  GitCommit, 
  GitPullRequest,
  Terminal,
} from 'lucide-vue-next'
import ExplorerPanel from './components/panel/ExplorerPanel.vue'
import SearchPanel from './components/panel/SearchPanel.vue'
import CommitPanel from './components/panel/CommitPanel.vue'
import PullRequestPanel from './components/panel/PullRequestPanel.vue'
import TerminalPanel from './components/panel/TerminalPanel.vue'

const actor: CodeState = applicationState.system.get(id)

// State selectors
const rootDirectory = useSelector(actor, (state) => state.context.rootDirectory)
const currentDirectory = useSelector(actor, (state) => state.context.currentDirectory)
const files = useSelector(actor, (state) => state.context.files)
const isLoading = useSelector(actor, (state) => state.context.isLoading)
const error = useSelector(actor, (state) => state.context.error)
const selectedPanel = useSelector(actor, (state) => state.context.selectedPanel)



// Panel configuration
const panels = [
  { id: 'explorer', label: 'Explorer', icon: FolderOpen },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'commit', label: 'Commit Changes', icon: GitCommit },
  { id: 'pr', label: 'Pull Request', icon: GitPullRequest },
  { id: 'terminal', label: 'Terminal', icon: Terminal }
] as const

// Event handlers
const selectPanel = (panel: 'explorer' | 'search' | 'commit' | 'pr' | 'terminal') => {
  actor.send({ type: 'SELECT_PANEL', panel })
}

const navigateToDirectory = (path: string) => {
  actor.send({ type: 'NAVIGATE_TO_DIRECTORY', path })
}

const setRootDirectory = (path: string) => {
  actor.send({ type: 'SET_ROOT_DIRECTORY', path })
}

const handleFileClick = (file: { path: string; type: 'file' | 'directory' }) => {
  if (file.type === 'directory') {
    actor.send({ type: 'NAVIGATE_TO_DIRECTORY', path: file.path })
  } else {
    actor.send({ type: 'OPEN_FILE', path: file.path })
  }
}

const changeDirectory = () => {
  const newPath = prompt('Enter new root directory path:', rootDirectory.value)
  if (newPath && newPath !== rootDirectory.value) {
    actor.send({ type: 'SET_ROOT_DIRECTORY', path: newPath })
  }
}

const handleRenameFile = (oldPath: string, newName: string) => {
  // Construct the new path
  const pathParts = oldPath.split('/')
  pathParts[pathParts.length - 1] = newName
  const newPath = pathParts.join('/')
  
  // Send rename event to state machine
  actor.send({ type: 'RENAME_FILE', oldPath, newPath })
}

const handleDeleteFile = (path: string) => {
  // Send delete event to state machine
  actor.send({ type: 'DELETE_FILE', path })
}

// Plugin activation is handled by the state machine
onMounted(() => {
  actor.send({ type: 'PLUGIN_ACTIVATED' })
})
</script>