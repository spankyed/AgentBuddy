<template>
  <div 
    v-if="tabs.length > 0" 
    class="tabs-container flex items-center overflow-x-auto border-b bg-neutral-900 border-neutral-800"
    @dragover="handleContainerDragOver"
    @drop="handleContainerDrop"
    @dragleave="handleDragLeave"
  >
    <div
      v-for="(tab, index) in tabs"
      :key="tab.path"
      class="tab-item group relative flex items-center border-r border-neutral-800"
      :class="[
        activeTabPath === tab.path ? 'bg-neutral-850' : 'bg-neutral-900 hover:bg-neutral-800',
        draggedIndex === index ? 'opacity-50' : ''
      ]"
      :data-index="index"
      draggable="true"
      @dragstart="handleDragStart(index, $event)"
      @dragend="handleDragEnd"
    >
      <!-- Drop indicator -->
      <div
        v-if="draggedIndex !== null && dropPosition.index === index && dropPosition.side === 'left'"
        class="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10"
      />
      <div
        v-if="draggedIndex !== null && dropPosition.index === index && dropPosition.side === 'right'"
        class="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10"
      />
      
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
        class="flex items-center justify-center w-5 h-5 mx-2 transition-all rounded-sm opacity-0 group-hover:opacity-100 hover:bg-neutral-700"
      >
        <X class="w-3 h-3" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { X, FileCode, File, FileJson, FileText, Image, GitCompare, Terminal, Play, Sparkle } from 'lucide-vue-next'
import type { OpenFile, TerminalTab } from '@/plugins/code/state'
import type { ActionTab } from '@/plugins/code/features/actions/state'
import type { PromptTab } from '@/plugins/code/features/prompts/state'

// Props
const props = defineProps<{
  tabs: (OpenFile | TerminalTab | ActionTab | PromptTab)[]
  activeTabPath: string | null
}>()

// Emits
const emit = defineEmits<{
  select: [path: string]
  close: [path: string]
  reorder: [fromIndex: number, toIndex: number]
}>()

// Drag state
const draggedIndex = ref<number | null>(null)
const dropPosition = ref<{ index: number | null; side: 'left' | 'right' }>({ index: null, side: 'left' })

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

// Drag handlers
const handleDragStart = (index: number, event: DragEvent) => {
  draggedIndex.value = index
  event.dataTransfer!.effectAllowed = 'move'
  // Store the index in dataTransfer for cross-browser compatibility
  event.dataTransfer!.setData('text/plain', index.toString())
}

const handleContainerDragOver = (event: DragEvent) => {
  if (draggedIndex.value === null) return
  
  event.preventDefault()
  event.dataTransfer!.dropEffect = 'move'
  
  // Find which tab we're over
  const container = event.currentTarget as HTMLElement
  const tabElements = Array.from(container.querySelectorAll('.tab-item')) as HTMLElement[]
  const mouseX = event.clientX
  
  for (let i = 0; i < tabElements.length; i++) {
    const rect = tabElements[i].getBoundingClientRect()
    
    // Check if mouse is over this tab or in the gap after it
    if (mouseX >= rect.left && mouseX <= (tabElements[i + 1]?.getBoundingClientRect().left || rect.right + 10)) {
      const midpoint = rect.left + rect.width / 2
      const side = mouseX < midpoint ? 'left' : 'right'
      dropPosition.value = { index: i, side }
      return
    }
  }
}

const handleContainerDrop = (event: DragEvent) => {
  if (draggedIndex.value === null || dropPosition.value.index === null) return
  
  event.preventDefault()
  
  const index = dropPosition.value.index
  let targetIndex = index
  
  if (dropPosition.value.side === 'right') {
    targetIndex = index + 1
    if (draggedIndex.value < index) {
      targetIndex = index
    }
  } else {
    if (draggedIndex.value > index) {
      targetIndex = index
    } else {
      targetIndex = index - 1
    }
  }
  
  targetIndex = Math.max(0, Math.min(props.tabs.length - 1, targetIndex))
  emit('reorder', draggedIndex.value, targetIndex)
  
  // Clean up
  draggedIndex.value = null
  dropPosition.value = { index: null, side: 'left' }
}

const handleDragEnd = () => {
  // Clean up in case drop didn't fire
  draggedIndex.value = null
  dropPosition.value = { index: null, side: 'left' }
}

const handleDragLeave = (event: DragEvent) => {
  // Only clear if leaving the container entirely
  const container = event.currentTarget as HTMLElement
  const relatedTarget = event.relatedTarget as HTMLElement
  
  if (!container.contains(relatedTarget)) {
    dropPosition.value = { index: null, side: 'left' }
  }
}
</script>

<style>
.bg-neutral-850 {
  background-color: rgb(28, 28, 30);
}

/* Make tabs appear draggable */
[draggable="true"] {
  cursor: move;
}

/* During drag */
[draggable="true"]:active {
  cursor: grabbing;
}
</style>