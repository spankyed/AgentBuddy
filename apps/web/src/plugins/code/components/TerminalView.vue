<template>
  <!-- Fills available space; Tailwind-coloured background for consistency -->
  <div ref="container" class="h-full w-full bg-[#1e1e1e]"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { applicationState } from '@/app'
import { id, type CodeState, type TerminalInfo } from '../state'
import '@xterm/xterm/css/xterm.css'

/* --------------------------------------------------------------------------
 * Props & actor -------------------------------------------------------------------------- */
const props = defineProps<{
  terminalInfo: TerminalInfo
  /**
   * Streamed stdout/stderr chunks from the backend.  Each entry is the raw byte
   * string *exactly* as it should be written to the PTY.
   */
  outputs?: string[]
}>()

const actor: CodeState = applicationState.system.get(id)

/* --------------------------------------------------------------------------
 * Refs / Singletons ---------------------------------------------------------------------- */
const container = ref<HTMLElement>() // mount point for xterm
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null

// Track how many output entries we've already rendered so that we only write
// new chunks as they arrive.
let processedCount = 0

/* --------------------------------------------------------------------------
 * Helpers ------------------------------------------------------------------------------- */
const fit = () => fitAddon?.fit()

const sendResize = () => {
  if (!term) return
  actor.send({
    type: 'RESIZE_TERMINAL',
    terminalId: props.terminalInfo.id,
    cols: term.cols,
    rows: term.rows
  })
}

/**
 * Write a batch of data chunks to the terminal.
 */
const writeChunks = (chunks: string[]) => {
  for (const chunk of chunks) term?.write(chunk)
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

  /* 3. Stream existing buffered output (if any) */
  if (props.outputs?.length) {
    writeChunks(props.outputs)
    processedCount = props.outputs.length
  }

  /* 4. PTY -> FE communication */
  term.onData(data => {
    actor.send({ type: 'TERMINAL_INPUT', terminalId: props.terminalInfo.id, data })
  })

  term.onResize(({ cols, rows }) => {
    actor.send({ type: 'RESIZE_TERMINAL', terminalId: props.terminalInfo.id, cols, rows })
  })

  /* 5. Keep the terminal sized with its container */
  resizeObserver = new ResizeObserver(() => {
    fit()
    sendResize()
  })
  resizeObserver.observe(container.value)

  /* 6. Focus terminal - shell initialization now happens on backend */
  term.focus()
})

/**
 * Stream new output chunks into xterm (reactive).
 */
watch(
  () => props.outputs,
  (newVal) => {
    if (!term || !newVal) return
    const unprocessed = newVal.slice(processedCount)
    if (unprocessed.length) {
      writeChunks(unprocessed)
      processedCount = newVal.length
    }
  },
  { deep: true }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  term?.dispose()
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
/* Slight padding inside the terminal for aesthetics */
:deep(.xterm) {
  height: 100%;
  padding: 8px;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
