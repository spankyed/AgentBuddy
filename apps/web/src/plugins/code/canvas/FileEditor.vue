<template>
  <div class="flex flex-col h-full">
    <!-- Tabs (for both files and terminals) -->
    <div v-if="openFiles.length > 0" class="flex items-center overflow-x-auto border-b bg-neutral-900 border-neutral-800">
      <div
        v-for="file in openFiles"
        :key="file.path"
        class="flex items-center group"
        :class="[
          'border-r border-neutral-800',
          activeFilePath === file.path ? 'bg-neutral-850' : 'bg-neutral-900 hover:bg-neutral-800'
        ]"
      >
        <button
          @click="selectFile(file.path)"
          class="flex items-center gap-2 py-2 pl-3 text-sm transition-colors"
          :class="activeFilePath === file.path ? 'text-neutral-100' : 'text-neutral-400'"
        >
          <component 
            :is="getTabIcon(file)"
            class="flex-shrink-0 w-4 h-4"
          />
          <span class="max-w-[150px] truncate">{{ getTabLabel(file) }}</span>
          <span v-if="!isTerminal(file) && !file.isDiff && file.pendingSaveConflict" class="w-2 h-2 bg-orange-500 rounded-full"></span>
          <span v-else-if="!isTerminal(file) && !file.isDiff && file.modified" class="w-2 h-2 bg-blue-500 rounded-full"></span>
        </button>
        <button
          @click.stop="closeFile(file.path)"
          class="p-1 mx-2 transition-all rounded-sm opacity-0 group-hover:opacity-100 hover:bg-neutral-700"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Editor -->
    <div class="relative flex-1 min-h-0 bg-neutral-900">
      <div v-if="openFiles.length === 0" class="absolute inset-0 flex items-center justify-center">
        <div class="text-center">
          <FileCode class="w-16 h-16 mx-auto mb-4 text-neutral-600" />
          <p class="text-neutral-400">Open a file from the explorer to start editing</p>
        </div>
      </div>
      
      <div v-else-if="activeFile" class="absolute inset-0 overflow-hidden">
        <!-- Single instance of each component type -->
        <!-- Terminal for terminal tabs -->
        <div v-show="isTerminal(activeFile)" class="h-full overflow-hidden">
          <TerminalView
            v-if="isTerminal(activeFile)"
            :key="(activeFile as TerminalTab).terminalInfo.id"
            :terminal-info="(activeFile as TerminalTab).terminalInfo"
            class="h-full"
          />
        </div>
        
        <!-- Diff viewer for diff tabs -->
        <div v-show="'isDiff' in activeFile && activeFile.isDiff" class="h-full overflow-hidden">
          <DiffViewer
            v-if="'isDiff' in activeFile && activeFile.isDiff"
            :key="activeFile.path"
            :selected-git-file="(activeFile as any).gitFile!"
            :git-diff="(activeFile as any).gitDiff!"
            class="h-full"
          />
        </div>
        
        <!-- Regular editor for normal files -->
        <div v-show="!isTerminal(activeFile) && !('isDiff' in activeFile && activeFile.isDiff)" class="h-full overflow-hidden">
          <SimpleMonacoEditor
            v-if="!isTerminal(activeFile) && !('isDiff' in activeFile && activeFile.isDiff)"
            :key="activeFile.path"
            :model-value="activeFile.content"
            @update:model-value="handleContentChange"
            :file-path="activeFilePath || undefined"
            theme="vs-dark"
            class="h-full"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { X, FileCode, File, FileJson, FileText, Image, GitCompare, Terminal } from 'lucide-vue-next'
import DiffViewer from './DiffViewer.vue'
import SimpleMonacoEditor from './SimpleMonacoEditor.vue'
import TerminalView from './TerminalView.vue'
import { applicationState } from '@/app'
import { id, type CodeState, type OpenFile, type TerminalTab } from '@/plugins/code/state'
import type { ActionTab } from '@/plugins/code/features/actions/state'

// Props
const props = defineProps<{
  openFiles: (OpenFile | TerminalTab | ActionTab)[]
  activeFilePath: string | null
}>()

// Debug log
watch(() => props.openFiles, (newFiles) => {
  console.log('FileEditor - openFiles changed:', newFiles.length, newFiles.map(f => ({ 
    path: f.path, 
    isTerminal: 'isTerminal' in f && f.isTerminal,
    terminalId: 'isTerminal' in f && f.isTerminal && 'terminalInfo' in f ? (f as TerminalTab).terminalInfo.id : undefined
  })))
  console.log('FileEditor - activeFilePath:', props.activeFilePath)
}, { immediate: true, deep: true })

watch(() => props.activeFilePath, (newPath) => {
  console.log('FileEditor - activeFilePath changed to:', newPath)
}, { immediate: true })

// Emits
const emit = defineEmits<{
  selectFile: [path: string]
  closeFile: [path: string]
  contentChange: [path: string, content: string]
}>()

// Terminal output is now handled directly in TerminalView

// Helper to check if a file is a terminal
const isTerminal = (file: OpenFile | TerminalTab | ActionTab): file is TerminalTab => {
  return 'isTerminal' in file && file.isTerminal === true
}

// Terminal output is handled via props

// Computed
const activeFile = computed(() => 
  props.openFiles.find(f => f.path === props.activeFilePath)
)

// Using SimpleMonacoEditor for basic syntax highlighting

// Event handlers
const selectFile = (path: string) => {
  emit('selectFile', path)
}

const closeFile = (path: string) => {
  emit('closeFile', path)
}

const handleContentChange = (value: string) => {
  if (props.activeFilePath) {
    emit('contentChange', props.activeFilePath, value)
  }
}

// Helper functions
const getFileName = (path: string) => {
  return path.split('/').pop() || path
}

const getTabLabel = (file: OpenFile | TerminalTab | ActionTab) => {
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
  return getFileName(file.path)
}

const getTabIcon = (file: OpenFile | TerminalTab | ActionTab) => {
  if (isTerminal(file)) {
    return Terminal
  }
  if ('isDiff' in file && file.isDiff) {
    return GitCompare
  }
  return getFileIcon(getFileExtension(file.path))
}

const getFileExtension = (path: string) => {
  const parts = path.split('.')
  return parts.length > 1 ? parts.pop() : ''
}

// Language detection is handled by SimpleMonacoEditor

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