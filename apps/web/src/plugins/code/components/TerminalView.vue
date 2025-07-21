<template>
  <div ref="terminalContainer" class="h-full w-full bg-black"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { applicationState } from '@/app'
import { id, type CodeState, type TerminalInfo } from '../state'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  terminalInfo: TerminalInfo
}>()

const actor: CodeState = applicationState.system.get(id)
const terminalContainer = ref<HTMLElement>()
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null

// Initialize terminal
onMounted(() => {
  if (!terminalContainer.value) return

  // Create terminal instance
  terminal = new Terminal({
    theme: {
      background: '#0a0a0a',
      foreground: '#e4e4e7',
      cursor: '#e4e4e7',
      black: '#0a0a0a',
      red: '#ef4444',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#8b5cf6',
      cyan: '#06b6d4',
      white: '#e4e4e7',
      brightBlack: '#52525b',
      brightRed: '#f87171',
      brightGreen: '#34d399',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#a78bfa',
      brightCyan: '#22d3ee',
      brightWhite: '#f4f4f5'
    },
    fontSize: 14,
    fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    cols: props.terminalInfo.cols,
    rows: props.terminalInfo.rows
  })

  // Initialize fit addon
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  // Open terminal in container
  terminal.open(terminalContainer.value)
  
  // Initial fit
  setTimeout(() => {
    fitAddon?.fit()
    // Send resize event to backend
    if (terminal) {
      actor.send({
        type: 'RESIZE_TERMINAL',
        terminalId: props.terminalInfo.id,
        cols: terminal.cols,
        rows: terminal.rows
      })
    }
  }, 0)

  // Handle terminal input
  terminal.onData((data) => {
    actor.send({
      type: 'TERMINAL_INPUT',
      terminalId: props.terminalInfo.id,
      data
    })
  })

  // Handle resize
  terminal.onResize(({ cols, rows }) => {
    actor.send({
      type: 'RESIZE_TERMINAL',
      terminalId: props.terminalInfo.id,
      cols,
      rows
    })
  })

  // Set up resize observer
  resizeObserver = new ResizeObserver(() => {
    if (fitAddon && terminal) {
      fitAddon.fit()
    }
  })
  resizeObserver.observe(terminalContainer.value)

  // Listen for terminal output
  const unsubscribe = actor.subscribe((state) => {
    // This is a simplified approach - in production, you might want to use a more sophisticated event system
    // Listen for TERMINAL_OUTPUT events in the parent component and pass data as props
  })
})

// Handle terminal output (called from parent component)
const writeData = (data: string) => {
  terminal?.write(data)
}

// Focus terminal
const focus = () => {
  terminal?.focus()
}

// Expose methods to parent
defineExpose({
  writeData,
  focus
})

// Cleanup
onUnmounted(() => {
  resizeObserver?.disconnect()
  terminal?.dispose()
})
</script>

<style scoped>
:deep(.xterm) {
  height: 100%;
  padding: 8px;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>