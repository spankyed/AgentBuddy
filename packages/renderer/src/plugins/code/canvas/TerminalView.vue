<template>
  <div class="relative h-full w-full">
    <div ref="container" class="h-full w-full bg-[#1e1e1e]"></div>
    <ScrollToBottomFob :visible="showScrollFob" @click="scrollToBottom()" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import ScrollToBottomFob from '@/core/components/design/ScrollToBottomFob.vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { applicationState } from '@/main'
import { id, type CodeState } from '@/plugins/code/state'
import type { TerminalInfo } from '@/plugins/code/features/terminal/state'
import { terminalEventBus } from '@/plugins/code/utils/terminal-events'
import '@xterm/xterm/css/xterm.css'

/* --------------------------------------------------------------------------
 * Props & actor -------------------------------------------------------------------------- */
const props = defineProps<{
  terminalInfo: TerminalInfo
}>()

const codeActor: CodeState = applicationState.system.get(id)
const terminalActor = codeActor.system.get('terminal')

/* --------------------------------------------------------------------------
 * Refs / Singletons ---------------------------------------------------------------------- */
const container = ref<HTMLElement>() // mount point for xterm
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let unsubscribe: (() => void) | null = null
let isShowingLoadingContent = false
const isPinnedToBottom = ref(true)
let isScrollingProgrammatically = false
const showScrollFob = computed(() => !isPinnedToBottom.value)

/* --------------------------------------------------------------------------
 * Helpers ------------------------------------------------------------------------------- */
const fit = () => fitAddon?.fit()

const scrollToBottom = () => {
  if (!term) return
  isPinnedToBottom.value = true
  isScrollingProgrammatically = true
  term.scrollToBottom()
  requestAnimationFrame(() => { isScrollingProgrammatically = false })
}

const sendResize = () => {
  if (!term) return
  terminalActor?.send({
    type: 'terminal.RESIZE',
    terminalId: props.terminalInfo.id,
    cols: term.cols,
    rows: term.rows
  })
}

const showLoadingContent = () => {
  if (!term) return
  
  term.write('\x1b[1;36m🚀 Starting terminal...\x1b[0m\r\n')
  term.write('\x1b[90mConnecting to shell: \x1b[0m' + (props.terminalInfo.shell || 'default') + '\r\n')
  term.write('\x1b[90mWorking directory: \x1b[0m' + props.terminalInfo.cwd + '\r\n\r\n')
  
  isShowingLoadingContent = true
}

/* --------------------------------------------------------------------------
 * Lifecycle --------------------------------------------------------------------------- */
onMounted(() => {
  if (!container.value) return

  /* 1. Construct terminal + addons */
  term = new Terminal({
    fontFamily: 'JetBrains Mono, Cascadia Code, Fira Code, Menlo, monospace',
    fontSize: 14,
    convertEol: true,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10_000,
    cols: props.terminalInfo.cols || 80,
    rows: props.terminalInfo.rows || 24,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      cursorAccent: '#1e1e1e',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5'
    }
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  /* 2. Mount & fit */
  term.open(container.value)
  term.element!.style.height = '100%'
  fit()
  sendResize()

  /* 2a. Track user scroll to support "pin to bottom" */
  const viewport = term.element!.querySelector('.xterm-viewport')
  if (viewport) {
    viewport.addEventListener('scroll', () => {
      if (isScrollingProgrammatically) return
      isPinnedToBottom.value = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 10
    }, { passive: true })
  }

  /* 3. Load any stored output or show loading content */
  const storedOutput = terminalEventBus.getOutput(props.terminalInfo.id)
  if (storedOutput) {
    term.write(storedOutput)
  } else {
    showLoadingContent()
  }
  
  /* 4. Subscribe to terminal output events */
  unsubscribe = terminalEventBus.subscribe(props.terminalInfo.id, (terminalId, data) => {
    if (!term) return
    
    // Clear loading content on first real output
    if (isShowingLoadingContent) {
      term.clear()
      isShowingLoadingContent = false
    }
    
    term.write(data, () => {
      if (isPinnedToBottom.value) scrollToBottom()
    })
  })

  /* 5. PTY -> FE communication */
  term.onData(data => {
    terminalActor?.send({ type: 'terminal.INPUT', terminalId: props.terminalInfo.id, data })
  })

  /* 5a. Custom keyboard handling to handle Shift+Enter as newline */
  term.attachCustomKeyEventHandler((event) => {
    // Handle Shift+Enter to insert newline without executing
    if (event.type === 'keydown' && (event.key === 'Enter' || event.keyCode === 13) && event.shiftKey) {
      // Send a newline character (LF) instead of carriage return (CR)
      // This will move to the next line without executing the command
      terminalActor?.send({ 
        type: 'terminal.INPUT', 
        terminalId: props.terminalInfo.id, 
        data: '\n' 
      })
      
      // Prevent the default Enter behavior
      event.preventDefault()
      event.stopPropagation()
      return false
    }
    
    // Let all other keys pass through normally
    return true
  })

  term.onResize(({ cols, rows }) => {
    terminalActor?.send({ type: 'terminal.RESIZE', terminalId: props.terminalInfo.id, cols, rows })
  })

  /* 6. Keep the terminal sized with its container */
  resizeObserver = new ResizeObserver(() => {
    fit()
    sendResize()
    if (isPinnedToBottom) scrollToBottom()
  })
  resizeObserver.observe(container.value)

  /* 7. Focus terminal - shell initialization now happens on backend */
  term.focus()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  term?.dispose()
  if (unsubscribe) unsubscribe()
})

/* --------------------------------------------------------------------------
 * Public API (exposed to parent via refs) ---------------------------------- */
function focus() {
  term?.focus()
}

// expose allows parent components using `ref="child"` to access focus()
// eslint-disable-next-line vue/no-setup-props-destructure
defineExpose({ focus })
</script>

<style scoped>
/* Terminal container should not create its own scroll */
:host,
:deep(.xterm) {
  height: 100%;
  padding: 8px;
}

/* Terminal-specific scrollbar styling */
:deep(.xterm-viewport) {
  background-color: transparent !important;
  /* Override global scrollbar styles for terminal */
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