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
      />
      
      <SearchPanel 
        v-else-if="selectedPanel === 'search'" 
      />
      
      <CommitPanel 
        v-else-if="selectedPanel === 'commit'"
      />
      
      <PullRequestPanel 
        v-else-if="selectedPanel === 'pr'"
      />
      
      <TerminalPanel 
        v-else-if="selectedPanel === 'terminal'"
      />
      
      <ActionsPanel 
        v-else-if="selectedPanel === 'actions'"
      />
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
import { onMounted, computed } from 'vue'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from '@/plugins/code/state'
import { 
  FolderOpen, 
  Search, 
  GitCommit, 
  GitPullRequest,
  Terminal,
  Code2,
} from 'lucide-vue-next'
import ExplorerPanel from '@/plugins/code/features/explorer/ExplorerPanel.vue'
import SearchPanel from '@/plugins/code/features/search/SearchPanel.vue'
import CommitPanel from '@/plugins/code/features/commit/CommitPanel.vue'
import PullRequestPanel from '@/plugins/code/features/pull-request/PullRequestPanel.vue'
import TerminalPanel from '@/plugins/code/features/terminal/TerminalPanel.vue'
import ActionsPanel from '@/plugins/code/features/actions/ActionsPanel.vue'

const actor: CodeState = applicationState.system.get(id)

const rootDirectory = useSelector(actor, (state) => state.context.rootDirectory)
const currentDirectory = useSelector(actor, (state) => state.context.currentDirectory)
const selectedPanel = useSelector(actor, (state) => state.context.selectedPanel)

// Panel configuration
const panels = [
  { id: 'explorer', label: 'Explorer', icon: FolderOpen },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'commit', label: 'Commit Changes', icon: GitCommit },
  { id: 'pr', label: 'Pull Request', icon: GitPullRequest },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'actions', label: 'Actions', icon: Code2 }
] as const

// Event handlers
const selectPanel = (panel: 'explorer' | 'search' | 'commit' | 'pr' | 'terminal' | 'actions') => {
  // Update parent state
  actor.send({ 
    type: 'UPDATE_STATE', 
    updates: { selectedPanel: panel } 
  })
  
  // Notify child machines if needed
  if (panel === 'commit') {
    actor.system.get('commit')?.send({ type: 'commit.REFRESH_STATUS' })
  } else if (panel === 'pr') {
    actor.system.get('pr')?.send({ type: 'pr.REFRESH_STATUS' })
  } else if (panel === 'terminal') {
    actor.system.get('terminal')?.send({ type: 'terminal.REFRESH_LIST' })
  } else if (panel === 'actions') {
    actor.system.get('codeActions')?.send({ type: 'codeActions.LIST' })
  }
}

// Navigation handlers removed - now handled directly in ExplorerPanel

const changeDirectory = () => {
  const newPath = prompt('Enter new root directory path:', rootDirectory.value)
  if (newPath && newPath !== rootDirectory.value) {
    const explorerActor = actor.system.get('explorer')
    explorerActor?.send({ type: 'explorer.SET_ROOT_DIRECTORY', path: newPath })
  }
}


// Plugin activation is handled by the state machine
onMounted(() => {
  actor.send({ type: 'PLUGIN_ACTIVATED' })
})
</script>