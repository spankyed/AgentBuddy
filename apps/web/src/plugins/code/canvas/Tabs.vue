<template>
  <div v-if="tabs.length > 0" class="flex items-center overflow-x-auto border-b bg-neutral-900 border-neutral-800">
    <div
      v-for="tab in tabs"
      :key="tab.path"
      class="flex items-center group"
      :class="[
        'border-r border-neutral-800',
        activeTabPath === tab.path ? 'bg-neutral-850' : 'bg-neutral-900 hover:bg-neutral-800'
      ]"
    >
      <button
        @click="$emit('select', tab.path)"
        class="flex items-center gap-2 py-2 pl-3 text-sm transition-colors"
        :class="activeTabPath === tab.path ? 'text-neutral-100' : 'text-neutral-400'"
      >
        <component 
          :is="getTabIcon(tab)"
          class="flex-shrink-0 w-4 h-4"
        />
        <span class="max-w-[150px] truncate">{{ getTabLabel(tab) }}</span>
        <span v-if="!isTerminal(tab) && !tab.isDiff && tab.pendingSaveConflict" class="w-2 h-2 bg-orange-500 rounded-full"></span>
        <span v-else-if="!isTerminal(tab) && !tab.isDiff && tab.modified" class="w-2 h-2 bg-blue-500 rounded-full"></span>
      </button>
      <button
        @click.stop="$emit('close', tab.path)"
        class="p-1 mx-2 transition-all rounded-sm opacity-0 group-hover:opacity-100 hover:bg-neutral-700"
      >
        <X class="w-3 h-3" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X, FileCode, File, FileJson, FileText, Image, GitCompare, Terminal, Play, Sparkle } from 'lucide-vue-next'
import type { OpenFile, TerminalTab } from '@/plugins/code/state'
import type { ActionTab } from '@/plugins/code/features/actions/state'
import type { PromptTab } from '@/plugins/code/features/prompts/state'

// Props
defineProps<{
  tabs: (OpenFile | TerminalTab | ActionTab | PromptTab)[]
  activeTabPath: string | null
}>()

// Emits
defineEmits<{
  select: [path: string]
  close: [path: string]
}>()

// Helper to check if a file is a terminal
const isTerminal = (file: OpenFile | TerminalTab | ActionTab | PromptTab): file is TerminalTab => {
  return 'isTerminal' in file && file.isTerminal === true
}

// Helper functions
const getFileName = (path: string) => {
  return path.split('/').pop() || path
}

const getTabLabel = (file: OpenFile | TerminalTab | ActionTab | PromptTab) => {
  if (isTerminal(file)) {
    return file.terminalInfo.title
  }
  if ('isDiff' in file && file.isDiff && (file as any).gitFile) {
    const fileName = getFileName((file as any).gitFile.path)
    const status = (file as any).gitFile.staged ? 'staged' : 'unstaged'
    return `${fileName} (${status})`
  }
  // Check if this is an action file
  if ('isAction' in file && file.isAction && 'actionEntity' in file) {
    return (file as any).actionEntity.label
  }
  // Check if this is a prompt file
  if ('isPrompt' in file && file.isPrompt && 'promptEntity' in file) {
    return (file as any).promptEntity.label
  }
  return getFileName(file.path)
}

const getTabIcon = (file: OpenFile | TerminalTab | ActionTab | PromptTab) => {
  if (isTerminal(file)) {
    return Terminal
  }
  if ('isDiff' in file && file.isDiff) {
    return GitCompare
  }
  // Check if this is an action file
  if ('isAction' in file && file.isAction) {
    return Play
  }
  // Check if this is a prompt file
  if ('isPrompt' in file && file.isPrompt) {
    return Sparkle
  }
  return getFileIcon(getFileExtension(file.path))
}

const getFileExtension = (path: string) => {
  const parts = path.split('.')
  return parts.length > 1 ? parts.pop() : ''
}

const getFileIcon = (extension?: string) => {
  if (!extension) return File
  
  const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'php', 'rb', 'swift']
  const textExtensions = ['txt', 'md', 'log', 'csv', 'xml', 'yaml', 'yml']
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp']
  
  if (codeExtensions.includes(extension)) return FileCode
  if (extension === 'json') return FileJson
  if (textExtensions.includes(extension)) return FileText
  if (imageExtensions.includes(extension)) return Image
  
  return File
}
</script>

<style>
.bg-neutral-850 {
  background-color: rgb(28, 28, 30);
}
</style>