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

      <ActionsPanel
        v-else-if="selectedPanel === 'actions'"
      />

      <PromptsPanel
        v-else-if="selectedPanel === 'prompts'"
      />
    </div>

    <!-- Resize handle between panel content and terminal -->
    <PanelResizer
      v-if="panelTerminalExpanded"
      orientation="vertical"
      subtle
      @resize="onTerminalResize"
      @click="actor.send({ type: 'TOGGLE_PANEL_TERMINAL' })"
    />

    <!-- Terminal section — always visible at bottom -->
    <PanelTerminalSection :height="terminalHeight" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from '@/plugins/code/state'
import ExplorerPanel from '@/plugins/code/features/explorer/ExplorerPanel.vue'
import SearchPanel from '@/plugins/code/features/search/SearchPanel.vue'
import CommitPanel from '@/plugins/code/features/commit/CommitPanel.vue'
import PullRequestPanel from '@/plugins/code/features/pull-request/PullRequestPanel.vue'
import ActionsPanel from '@/plugins/code/features/actions/ActionsPanel.vue'
import PromptsPanel from '@/plugins/code/features/prompts/PromptsPanel.vue'
import PanelTerminalSection from '@/plugins/code/features/terminal/PanelTerminalSection.vue'
import PanelResizer from '@/core/components/layout/panel-resizer.vue'

const actor: CodeState = applicationState.system.get(id)

const selectedPanel = useSelector(actor, (state) => state.context.selectedPanel)
const panelTerminalExpanded = useSelector(actor, (state) => state.context.panelTerminalExpanded)

const MIN_TERMINAL_HEIGHT = 100
const MAX_TERMINAL_HEIGHT = 600
const terminalHeight = ref(256)

const onTerminalResize = (delta: number) => {
  // Negative delta = dragging up = taller terminal
  terminalHeight.value = Math.max(MIN_TERMINAL_HEIGHT, Math.min(MAX_TERMINAL_HEIGHT, terminalHeight.value - delta))
}
</script>
