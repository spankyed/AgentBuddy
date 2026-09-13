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
import { useActorSystem } from '@abuddy/sdk/fe'
import { ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from '@/features/code/fe/state'
import ExplorerPanel from '@/features/code/fe/features/explorer/ExplorerPanel.vue'
import SearchPanel from '@/features/code/fe/features/search/SearchPanel.vue'
import CommitPanel from '@/features/code/fe/features/commit/CommitPanel.vue'
import PullRequestPanel from '@/features/code/fe/features/pull-request/PullRequestPanel.vue'
import ActionsPanel from '@/features/code/fe/features/actions/ActionsPanel.vue'
import PromptsPanel from '@/features/code/fe/features/prompts/PromptsPanel.vue'
import PanelTerminalSection from '@/features/code/fe/features/terminal/PanelTerminalSection.vue'
import PanelResizer from '@abuddy/ui/layout/panel-resizer'

const actorSystem = useActorSystem()

const actor: CodeState = actorSystem.get(id)

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
