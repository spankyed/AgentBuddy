<template>
  <div class="flex flex-col h-full">
    <!-- Tabs (for both files and terminals) -->
    <Tabs
      :tabs="openFiles"
      :active-tab-path="activeFilePath"
      @select="selectFile"
      @close="closeFile"
    />

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
import { FileCode } from 'lucide-vue-next'
import DiffViewer from './DiffViewer.vue'
import SimpleMonacoEditor from './SimpleMonacoEditor.vue'
import TerminalView from './TerminalView.vue'
import Tabs from './Tabs.vue'
import { applicationState } from '@/app'
import { id, type CodeState, type OpenFile, type TerminalTab } from '@/plugins/code/state'
import type { ActionTab } from '@/plugins/code/features/actions/state'
import type { PromptTab } from '@/plugins/code/features/prompts/state'

// Props
const props = defineProps<{
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[]
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
const isTerminal = (file: OpenFile | TerminalTab | ActionTab | PromptTab): file is TerminalTab => {
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
</script>