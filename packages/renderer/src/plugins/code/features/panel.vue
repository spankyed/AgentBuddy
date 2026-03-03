<template>
  <div class="flex flex-col h-full">
    <!-- Panel Content -->
    <div class="flex-1 overflow-hidden">
      <ExplorerPanel
        v-if="selectedPanel === 'explorer'"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from '@/plugins/code/state'
import ExplorerPanel from '@/plugins/code/features/explorer/ExplorerPanel.vue'
import SearchPanel from '@/plugins/code/features/search/SearchPanel.vue'
import CommitPanel from '@/plugins/code/features/commit/CommitPanel.vue'
import PullRequestPanel from '@/plugins/code/features/pull-request/PullRequestPanel.vue'
import TerminalPanel from '@/plugins/code/features/terminal/TerminalPanel.vue'
import ActionsPanel from '@/plugins/code/features/actions/ActionsPanel.vue'
import PromptsPanel from '@/plugins/code/features/prompts/PromptsPanel.vue'

const actor: CodeState = applicationState.system.get(id)

const selectedPanel = useSelector(actor, (state) => state.context.selectedPanel)
</script>
