<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <CodePanelHeader
      :icon="Terminal"
      title="Terminals"
    >
      <template #actions>
        <button
          @click="createNewTerminal()"
          class="p-0 transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          title="New Terminal"
        >
          <Plus :size="16" />
        </button>
      </template>
    </CodePanelHeader>

    <!-- Terminal List -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="terminals.length === 0" class="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <Terminal class="w-5 h-5 text-neutral-500" />
        <p class="text-sm text-neutral-400">No terminals open</p>
        <p class="text-xs text-neutral-500">Click + to create a new terminal</p>
      </div>

      <div v-else class="p-2">
        <ContextMenuRoot v-for="terminal in terminals" :key="terminal.id">
          <ContextMenuTrigger as-child>
            <div
              @click="selectTerminal(terminal)"
              class="flex items-center justify-between py-2 px-4 mb-2 transition-colors rounded-lg cursor-pointer"
              :class="[
                isActiveTerminal(terminal.id)
                  ? 'bg-primary-800/30 border border-primary-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border border-transparent'
              ]"
            >
              <div class="flex items-center flex-1 min-w-0 gap-3">
                <Terminal class="flex-shrink-0 w-4 h-4 text-neutral-400" />
                <div class="flex-1 min-w-0">
                  <div
                    v-if="renamingTerminalId === terminal.id"
                    @click.stop
                    class="flex items-center gap-1"
                  >
                    <input
                      ref="renameInput"
                      v-model="renameValue"
                      @blur="finishRename"
                      @keydown.enter="finishRename"
                      @keydown.esc="cancelRename"
                      class="px-1 text-sm font-medium bg-transparent border border-primary-500 rounded text-neutral-200 focus:outline-none"
                      @click.stop
                    />
                  </div>
                  <div v-else class="text-sm font-medium truncate text-neutral-200">
                    {{ getTerminalDisplayName(terminal) }}
                  </div>
                  <div class="text-xs truncate text-neutral-500">
                    {{ terminal.shell }} - PID: {{ terminal.pid }}
                  </div>
                </div>
              </div>

              <button
                @click.stop="closeTerminal(terminal)"
                class="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-700 rounded transition-colors"
                title="Close terminal"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </ContextMenuTrigger>

          <ContextMenuPortal>
            <ContextMenuContent class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
              <ContextMenuItem
                @select="startRename(terminal)"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <Edit :size="16" />
                Rename Terminal
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenuRoot>
      </div>
    </div>

    <!-- Terminal Error -->
    <div v-if="terminalError" class="p-4 m-2 border rounded bg-red-500/10 border-red-500/50">
      <div class="text-sm text-red-400">{{ terminalError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import type { TerminalInfo } from './state'
import { Terminal, X, Edit, Plus } from 'lucide-vue-next'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'
import { useTerminalActions } from '@/plugins/code/composables/useTerminalActions'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const terminalActor = codeActor.system.get('terminal')!
const settingsActor = applicationState.system.get('settings')


// State selectors from parent actor
const activeFilePath = useSelector(codeActor, (state) => state.context.activeFilePath)

// State selectors from terminal actor
const terminals = useSelector(terminalActor, (state: any) => state.context.terminals)
const terminalError = useSelector(terminalActor, (state: any) => state.context.terminalError)

// State selectors from settings actor
const confirmTerminalClose = useSelector(settingsActor, (state: any) => state.context.settings?.plugins?.code?.confirmTerminalClose ?? true)
const closeTerminalOnTabClose = useSelector(settingsActor, (state: any) => state.context.settings?.plugins?.code?.closeTerminalOnTabClose ?? true)

// Terminal actions composable
const { closeTerminal, getTerminalDisplayName } = useTerminalActions(
  terminalActor,
  confirmTerminalClose,
  closeTerminalOnTabClose
)

// Check if a terminal is active
const isActiveTerminal = (terminalId: string) => {
  return activeFilePath.value === `terminal:${terminalId}`
}

// Create a new terminal
const createNewTerminal = () => {
  terminalActor?.send({ type: 'terminal.CREATE' })
}

// Select a terminal
const selectTerminal = (terminal: TerminalInfo) => {
  terminalActor.send({
    type: 'terminal.OPEN_TAB',
    terminalInfo: terminal
  })
}

// Rename functionality
const renamingTerminalId = ref<string | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

const startRename = async (terminal: TerminalInfo) => {
  renamingTerminalId.value = terminal.id
  renameValue.value = terminal.customTitle || terminal.cwd.split('/').filter(Boolean).pop() || terminal.title
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

const finishRename = () => {
  if (renamingTerminalId.value && renameValue.value.trim()) {
    terminalActor?.send({
      type: 'terminal.RENAME',
      terminalId: renamingTerminalId.value,
      customTitle: renameValue.value.trim()
    })
  }
  cancelRename()
}

const cancelRename = () => {
  renamingTerminalId.value = null
  renameValue.value = ''
}

</script>

