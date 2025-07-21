<template>
  <terminal
    ref="terminalRef"
    :name="`terminal-${terminalInfo.id}`"
    :height="'100%'"
    :init-log="initLog"
    :input-filter="inputFilter"
    @exec-cmd="onExecCmd"
    class="h-full w-full terminal-container"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { Terminal } from 'vue-web-terminal'
import type { Message } from 'vue-web-terminal'
import { applicationState } from '@/app'
import { id, type CodeState, type TerminalInfo } from '../state'

const props = defineProps<{
  terminalInfo: TerminalInfo
  outputs?: string[]
}>()

const actor: CodeState = applicationState.system.get(id)
const terminalRef = ref<any>(null)
let isWaitingForOutput = false
let outputBuffer = ''

// Initial log message
const initLog: Message[] = [{
  type: 'normal',
  class: 'system',
  content: `Terminal ${props.terminalInfo.id} - ${props.terminalInfo.cwd}`
}]

// Filter input to capture commands
const inputFilter = (key: string, value: string): string => {
  // Allow all input through
  return value
}

// Store success callback for when output arrives
let pendingSuccessCallback: ((msg: Message | Message[]) => void) | null = null

// Handle command execution
const onExecCmd = (key: string, command: string, success: (msg: Message | Message[]) => void, failed: (msg: string) => void) => {
  console.log('Sending command to terminal:', props.terminalInfo.id, command)
  
  // Store the success callback to use when output arrives
  pendingSuccessCallback = success
  
  // Clear output buffer
  outputBuffer = ''
  isWaitingForOutput = true
  
  // Send the command to the backend
  actor.send({
    type: 'TERMINAL_INPUT',
    terminalId: props.terminalInfo.id,
    data: command + '\n'
  })
  
  // Set a timeout to handle cases where no output is received
  setTimeout(() => {
    if (isWaitingForOutput && !outputBuffer && pendingSuccessCallback) {
      pendingSuccessCallback({ type: 'normal', content: '' })
      pendingSuccessCallback = null
      isWaitingForOutput = false
    }
  }, 500)
}

// Initialize terminal
onMounted(async () => {
  await nextTick()
  if (terminalRef.value) {
    // Focus the terminal
    terminalRef.value.focus()
    
    // Get initial prompt by sending empty command
    setTimeout(() => {
      console.log('Getting initial prompt for terminal:', props.terminalInfo.id)
      actor.send({
        type: 'TERMINAL_INPUT',
        terminalId: props.terminalInfo.id,
        data: '\n'
      })
    }, 200)
  }
})

// Track processed outputs
let processedCount = 0

// Watch for output changes from parent
watch(() => props.outputs, (newOutputs) => {
  if (newOutputs && terminalRef.value) {
    // Process only new outputs
    const unprocessed = newOutputs.slice(processedCount)
    if (unprocessed.length > 0) {
      const combinedOutput = unprocessed.join('')
      console.log('Writing output to terminal:', JSON.stringify(combinedOutput))
      
      // If we're waiting for command output, buffer it
      if (isWaitingForOutput) {
        outputBuffer += combinedOutput
        
        // Check if we have a complete response (ends with prompt or newline)
        if (outputBuffer.includes('$') || outputBuffer.includes('#') || outputBuffer.includes('>') || outputBuffer.endsWith('\n')) {
          // Use the pending callback if available
          if (pendingSuccessCallback) {
            // Split output into lines and send as messages
            const lines = outputBuffer.trim().split('\n')
            const messages: Message[] = lines.map(line => ({
              type: 'normal',
              content: line
            }))
            pendingSuccessCallback(messages)
            pendingSuccessCallback = null
          }
          isWaitingForOutput = false
        }
      } else {
        // Not waiting for command output, just push as regular messages
        const lines = combinedOutput.split('\n')
        lines.forEach((line, index) => {
          if (line || index < lines.length - 1) { // Include empty lines except trailing
            terminalRef.value!.pushMessage({
              type: 'normal',
              class: 'normal',
              content: line
            })
          }
        })
      }
      
      processedCount = newOutputs.length
    }
  }
}, { deep: true, immediate: true })

// Focus terminal when needed
const focus = () => {
  terminalRef.value?.focus()
}
</script>

<style scoped>
:deep(.terminal-container) {
  height: 100% !important;
}

:deep(.t-terminal) {
  height: 100% !important;
  background-color: #0a0a0a !important;
}

:deep(.t-terminal-container) {
  height: 100% !important;
  background-color: #0a0a0a !important;
}

:deep(.t-terminal-content) {
  background-color: #0a0a0a !important;
  color: #e4e4e7 !important;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace !important;
  font-size: 14px !important;
  padding: 8px !important;
  height: calc(100% - 40px) !important;
  overflow-y: auto !important;
}

:deep(.t-terminal-input-box) {
  background-color: #0a0a0a !important;
  border-top: 1px solid #1f2937 !important;
}

:deep(.t-terminal-input) {
  background-color: transparent !important;
  color: #e4e4e7 !important;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace !important;
  font-size: 14px !important;
  border: none !important;
  outline: none !important;
}

:deep(.t-terminal-input-prefix) {
  color: #10b981 !important;
}

:deep(.t-terminal-cursor) {
  background-color: #e4e4e7 !important;
}

:deep(.t-terminal-content-item) {
  white-space: pre-wrap !important;
  word-break: break-all !important;
}

:deep(.t-terminal-content-item.normal) {
  color: #e4e4e7 !important;
}

:deep(.t-terminal-content-item.success) {
  color: #10b981 !important;
}

:deep(.t-terminal-content-item.error) {
  color: #ef4444 !important;
}

:deep(.t-terminal-content-item.warning) {
  color: #f59e0b !important;
}

:deep(.t-terminal-content-item.info) {
  color: #3b82f6 !important;
}

:deep(.t-terminal-content-item.system) {
  color: #8b5cf6 !important;
}
</style>