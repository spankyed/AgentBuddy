<template>
  <div class="flex flex-col h-full">
    <!-- Panel Content -->
    <div class="flex-1 overflow-hidden">
      <ExplorerPanel
        v-if="selectedPanel === 'explorer'"
        :base-directory="baseDirectory"
        :active-directory="activeDirectory"
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

      <PromptsPanel
        v-else-if="selectedPanel === 'prompts'"
      />

    <!-- Toolbar -->
    </div>
        <div class="flex items-center justify-center gap-1 p-2 border-b border-neutral-800">
      <!-- Code navigation panels -->
      <button
        v-for="panel in codePanels"
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

      <!-- Divider -->
      <div class="h-5 w-px bg-neutral-700 mx-1"></div>

      <!-- Actions/Prompts panels -->
      <button
        v-for="panel in actionPanels"
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
  </div>

</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from '@/plugins/code/state'
import {
  FolderOpen,
  Search,
  GitCommit,
  GitPullRequest,
  Terminal,
  Play,
  Sparkle
} from 'lucide-vue-next'
import ExplorerPanel from '@/plugins/code/features/explorer/ExplorerPanel.vue'
import SearchPanel from '@/plugins/code/features/search/SearchPanel.vue'
import CommitPanel from '@/plugins/code/features/commit/CommitPanel.vue'
import PullRequestPanel from '@/plugins/code/features/pull-request/PullRequestPanel.vue'
import TerminalPanel from '@/plugins/code/features/terminal/TerminalPanel.vue'
import ActionsPanel from '@/plugins/code/features/actions/ActionsPanel.vue'
import PromptsPanel from '@/plugins/code/features/prompts/PromptsPanel.vue'

const actor: CodeState = applicationState.system.get(id)

const baseDirectory = useSelector(actor, (state) => state.context.baseDirectory)
const activeDirectory = useSelector(actor, (state) => state.context.activeDirectory)
const selectedPanel = useSelector(actor, (state) => state.context.selectedPanel)

// Panel configuration - split into two groups
const codePanels = [
  { id: 'explorer', label: 'Explorer', icon: FolderOpen },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'commit', label: 'Commit Changes', icon: GitCommit },
  { id: 'pr', label: 'Pull Request', icon: GitPullRequest },
  { id: 'terminal', label: 'Terminal', icon: Terminal }
] as const

const actionPanels = [
  { id: 'actions', label: 'Actions', icon: Play },
  { id: 'prompts', label: 'Prompts', icon: Sparkle }
] as const

// Event handlers
const selectPanel = (panel: 'explorer' | 'search' | 'commit' | 'pr' | 'terminal' | 'actions' | 'prompts') => {
  actor.send({
    type: 'SELECT_PANEL',
    panel
  })
}
</script>
