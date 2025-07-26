<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-neutral-800">
      <h3 class="text-lg font-medium text-neutral-200">Terminals</h3>
      <button
        @click="createNewTerminal"
        class="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors"
      >
        <Plus class="w-4 h-4" />
        New Terminal
      </button>
    </div>

    <!-- Terminal List -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="terminals.length === 0" class="p-4 text-center text-neutral-500">
        No terminals open
      </div>
      
      <div v-else class="p-2">
        <div
          v-for="terminal in terminals"
          :key="terminal.id"
          @click="selectTerminal(terminal)"
          class="flex items-center justify-between p-3 mb-2 transition-colors rounded-lg cursor-pointer"
          :class="[
            isActiveTerminal(terminal.id)
              ? 'bg-primary-800/30 border border-primary-700'
              : 'bg-neutral-800 hover:bg-neutral-700 border border-transparent'
          ]"
        >
          <div class="flex items-center flex-1 min-w-0 gap-3">
            <Terminal class="flex-shrink-0 w-4 h-4 text-neutral-400" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate text-neutral-200">
                {{ terminal.title }}
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
      </div>
    </div>

    <!-- Terminal Error -->
    <div v-if="terminalError" class="p-4 m-2 border rounded bg-red-500/10 border-red-500/50">
      <div class="text-sm text-red-400">{{ terminalError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import type { TerminalInfo } from '@/plugins/code/state'
import { Terminal, Plus, X } from 'lucide-vue-next'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const terminalActor = codeActor.system.get('terminal')!


// State selectors from parent actor
const activeFilePath = useSelector(codeActor, (state) => state.context.activeFilePath)

// State selectors from terminal actor
const terminals = useSelector(terminalActor, (state: any) => state.context.terminals)
const terminalError = useSelector(terminalActor, (state: any) => state.context.terminalError)

// Check if a terminal is active
const isActiveTerminal = (terminalId: string) => {
  return activeFilePath.value === `terminal:${terminalId}`
}

// Create a new terminal
const createNewTerminal = () => {
  const title = `Terminal ${terminals.value.length + 1}`
  terminalActor?.send({ type: 'terminal.CREATE', title })
}

// Select a terminal
const selectTerminal = (terminal: TerminalInfo) => {
  console.log('Selecting terminal:', terminal.id, terminal.title)
  
  // Get current parent context
  const parentContext = codeActor.getSnapshot().context
  const terminalPath = `terminal:${terminal.id}`
  const openFiles = parentContext.openFiles || []
  const existingTab = openFiles.find(f => f.path === terminalPath)
  
  let newOpenFiles
  if (existingTab) {
    // Update existing tab
    newOpenFiles = openFiles.map(f => 
      f.path === terminalPath && 'isTerminal' in f && f.isTerminal
        ? { ...f, terminalInfo: terminal }
        : f
    )
  } else {
    // Add new terminal tab
    const terminalTab = {
      path: terminalPath,
      content: '',
      modified: false,
      isTerminal: true,
      terminalInfo: terminal
    }
    newOpenFiles = [...openFiles, terminalTab]
  }
  
  // Update parent state
  codeActor.send({ 
    type: 'UPDATE_STATE',
    updates: {
      openFiles: newOpenFiles,
      activeFilePath: terminalPath
    }
  });
}

// Close a terminal with confirmation
const closeTerminal = (terminal: TerminalInfo) => {
  const confirmed = confirm(`Close terminal "${terminal.title}"?`)
  if (confirmed) {
    terminalActor?.send({ type: 'terminal.CLOSE', terminalId: terminal.id })
  }
}
</script>