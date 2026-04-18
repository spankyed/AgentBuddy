<template>
  <div class="flex-shrink-0 border-t border-neutral-800">
    <!-- Collapsible header -->
    <div
      class="flex items-center justify-between p-3 px-5 cursor-pointer hover:bg-neutral-800/60 transition-colors"
      @click="codeActor.send({ type: 'TOGGLE_PANEL_TERMINAL' })"
    >
      <div class="flex items-center gap-1 text-xs font-medium text-neutral-400">
        <ChevronRight v-if="!isExpanded" class="w-3 h-3" />
        <ChevronDown v-else class="w-3 h-3" />
        TERMINAL{{ activeDisplayName ? ` — ${activeDisplayName}` : '' }}
      </div>
      <div class="flex items-center gap-1" @click.stop>
        <button
          @click="createTerminal"
          class="p-0.5 hover:bg-neutral-700 rounded transition-colors"
          title="New Terminal"
        >
          <Plus class="w-3 h-3 text-neutral-400" />
        </button>
      </div>
    </div>

    <!-- Expanded content: terminal + list side-by-side -->
    <div v-if="isExpanded" class="flex h-64 overflow-hidden">
      <!-- Terminal view (left) -->
      <div class="flex-1 min-w-0">
        <div v-if="activeTerminalInfo" ref="container" class="w-full h-full bg-[#1e1e1e]"></div>
        <div v-else class="flex items-center justify-center h-full text-xs text-neutral-500">
          No terminal selected
        </div>
      </div>

      <!-- Resize handle between terminal and list -->
      <div
        v-if="terminals.length > 0"
        class="w-0 h-full flex-shrink-0 relative cursor-col-resize group z-10"
        @mousedown.prevent="startListResize"
      >
        <div class="absolute top-0 bottom-0 -left-1 w-2 group-hover:bg-blue-500/50 transition-colors" />
      </div>

      <!-- Terminal list (right sidebar) -->
      <div v-if="terminals.length > 0" class="flex-shrink-0 border-l border-neutral-800 overflow-y-auto" :style="{ width: `${listWidth}px` }">
        <ContextMenuRoot v-for="terminal in terminals" :key="terminal.id">
          <ContextMenuTrigger as-child>
            <div
              @click="!isInTab(terminal.id) ? selectTerminal(terminal.id) : undefined"
              class="group flex items-center gap-1.5 px-2 py-1.5 text-xs transition-colors"
              :class="[
                isInTab(terminal.id)
                  ? 'text-neutral-600 cursor-default'
                  : panelTerminalId === terminal.id
                    ? 'bg-neutral-800 text-neutral-200 cursor-pointer'
                    : 'text-neutral-400 hover:bg-neutral-800/50 cursor-pointer'
              ]"
              :title="getTerminalDisplayName(terminal) + (isInTab(terminal.id) ? ' (in tab)' : '')"
            >
              <TerminalIcon class="w-3 h-3 flex-shrink-0" />
              <!-- Inline rename input -->
              <div v-if="renamingTerminalId === terminal.id" @click.stop class="flex-1 min-w-0">
                <input
                  ref="renameInput"
                  v-model="renameValue"
                  @blur="finishRename"
                  @keydown.enter="finishRename"
                  @keydown.esc="cancelRename"
                  class="w-full px-1 text-xs bg-transparent border border-primary-500 rounded text-neutral-200 focus:outline-none"
                />
              </div>
              <span v-else class="flex-1 min-w-0 truncate">{{ getTerminalDisplayName(terminal) }}</span>
              <button
                v-if="renamingTerminalId !== terminal.id"
                @click.stop="handleCloseTerminal(terminal)"
                class="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Close terminal"
              >
                <X class="w-2.5 h-2.5 text-neutral-500 hover:text-red-400" />
              </button>
            </div>
          </ContextMenuTrigger>

          <ContextMenuPortal>
            <ContextMenuContent class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
              <ContextMenuItem
                v-if="!isInTab(terminal.id)"
                @select="openInTab(terminal.id)"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <PanelTop :size="16" />
                Open in Tab
              </ContextMenuItem>
              <ContextMenuItem
                @select="startRename(terminal)"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <Edit :size="16" />
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                @select="handleCloseTerminal(terminal)"
                class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-red-400 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                <Trash2 :size="16" />
                Close Terminal
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenuRoot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { useSelector } from '@xstate/vue'
import { ChevronRight, ChevronDown, Plus, X, Edit, Trash2, PanelTop, Terminal as TerminalIcon } from 'lucide-vue-next'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import type { TerminalInfo } from './state'
import { terminalPool } from '@/plugins/code/utils/terminal-pool'
import { useTerminalActions } from '@/plugins/code/composables/useTerminalActions'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { IDisposable } from '@xterm/xterm'

// Actors
const codeActor: CodeState = applicationState.system.get(codeId)
const terminalActor = codeActor.system.get('terminal')!
const settingsActor = applicationState.system.get('settings')

// State selectors
const panelTerminalId = useSelector(codeActor, (state) => state.context.panelTerminalId)
const openFiles = useSelector(codeActor, (state) => state.context.openFiles)
const terminals = useSelector(terminalActor, (state: any) => state.context.terminals as TerminalInfo[])

const confirmTerminalClose = useSelector(settingsActor, (state: any) => state.context.settings?.plugins?.code?.confirmTerminalClose ?? true)
const closeTerminalOnTabClose = useSelector(settingsActor, (state: any) => state.context.settings?.plugins?.code?.closeTerminalOnTabClose ?? true)

const { getTerminalDisplayName, closeTerminal: closeTerminalWithConfirm } = useTerminalActions(terminalActor, confirmTerminalClose, closeTerminalOnTabClose)

// Derived
const activeTerminalInfo = computed(() =>
  terminals.value.find((t: TerminalInfo) => t.id === panelTerminalId.value)
)
const activeDisplayName = computed(() =>
  activeTerminalInfo.value ? getTerminalDisplayName(activeTerminalInfo.value) : ''
)
const isInTab = (terminalId: string) =>
  openFiles.value.some((f: any) => f.path === `terminal:${terminalId}` && f.isTerminal)

// Local state
const isExpanded = useSelector(codeActor, (state) => state.context.panelTerminalExpanded)
const container = ref<HTMLElement>()
const listWidth = ref(115)
const MIN_LIST_WIDTH = 80
const MAX_LIST_WIDTH = 300

// Terminal rendering
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let attachedTerminalId: string | null = null  // tracks which terminal is actually attached to the DOM
const viewDisposables: IDisposable[] = []

const attachTerminal = (terminalId: string) => {
  const info = terminals.value.find((t: TerminalInfo) => t.id === terminalId)
  if (!container.value || !info) return

  const sendInput = (data: string) => {
    terminalActor?.send({ type: 'terminal.INPUT', terminalId, data })
  }

  const entry = terminalPool.ensure(info, sendInput)
  terminalPool.attach(terminalId, container.value)
  attachedTerminalId = terminalId

  term = entry.term
  fitAddon = entry.fitAddon

  fitAddon.fit()
  sendResize(terminalId)
  terminalPool.syncViewport(terminalId)

  viewDisposables.push(term.onWriteParsed(() => {
    term?.scrollToBottom()
  }))

  viewDisposables.push(term.onResize(({ cols, rows }) => {
    terminalActor?.send({ type: 'terminal.RESIZE', terminalId, cols, rows })
  }))

  resizeObserver = new ResizeObserver(() => {
    // Defer fit to next frame so the browser has finished layout
    requestAnimationFrame(() => {
      fitAddon?.fit()
    })
  })
  resizeObserver.observe(container.value)

  term.focus()
}

const detachTerminal = () => {
  resizeObserver?.disconnect()
  resizeObserver = null
  for (const d of viewDisposables) {
    try { d.dispose() } catch { /* ignore */ }
  }
  viewDisposables.length = 0
  if (attachedTerminalId) {
    terminalPool.detach(attachedTerminalId)
    attachedTerminalId = null
  }
  term = null
  fitAddon = null
}

const sendResize = (terminalId: string) => {
  if (!term) return
  terminalActor?.send({
    type: 'terminal.RESIZE',
    terminalId,
    cols: term.cols,
    rows: term.rows
  })
}

// Actions
const createTerminal = () => {
  terminalActor?.send({ type: 'terminal.CREATE' })
  if (!isExpanded.value) {
    codeActor.send({ type: 'TOGGLE_PANEL_TERMINAL' })
  }
}

const selectTerminal = (terminalId: string) => {
  codeActor.send({ type: 'SELECT_PANEL_TERMINAL', terminalId })
}

const openInTab = (terminalId: string) => {
  codeActor.send({ type: 'OPEN_TERMINAL_IN_TAB', terminalId })
}

const handleCloseTerminal = (terminal: TerminalInfo) => {
  if (confirmTerminalClose.value) {
    const displayName = getTerminalDisplayName(terminal)
    if (!confirm(`Close terminal "${displayName}"?`)) return
  }
  terminalActor?.send({ type: 'terminal.CLOSE', terminalId: terminal.id })
}

// List resize
const startListResize = (e: MouseEvent) => {
  const startX = e.clientX
  const startWidth = listWidth.value

  const onMouseMove = (e: MouseEvent) => {
    const delta = startX - e.clientX // dragging left = wider list
    listWidth.value = Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, startWidth + delta))
    fitAddon?.fit()
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// Rename
const renamingTerminalId = ref<string | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement[]>([])

const startRename = async (terminal: TerminalInfo) => {
  renamingTerminalId.value = terminal.id
  renameValue.value = terminal.customTitle || terminal.cwd.split('/').filter(Boolean).pop() || terminal.title
  await nextTick()
  const input = renameInput.value?.[0]
  input?.focus()
  input?.select()
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

// Watch expand/collapse and panelTerminalId changes
watch([isExpanded, panelTerminalId], async ([expanded, termId], [wasExpanded, prevTermId]) => {
  if (expanded && termId) {
    // Detach old terminal if switching
    if (attachedTerminalId && attachedTerminalId !== termId) {
      detachTerminal()
    }
    await nextTick()
    attachTerminal(termId)
  } else if (!expanded || !termId) {
    detachTerminal()
  }
})

onBeforeUnmount(() => {
  detachTerminal()
})
</script>

<style scoped>
:deep(.xterm) {
  height: 100%;
  padding: 4px 8px;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

:deep(.xterm-viewport::-webkit-scrollbar) {
  width: 14px;
  height: 14px;
  background-color: rgba(0, 0, 0, 0.1);
}

:deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 0;
  border: 3px solid transparent;
  background-clip: padding-box;
}

:deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background-color: rgba(255, 255, 255, 0.3);
}

:deep(.xterm-viewport::-webkit-scrollbar-track) {
  background-color: transparent;
  border: none;
}

:deep(.xterm-viewport::-webkit-scrollbar-corner) {
  background-color: transparent;
}
</style>
