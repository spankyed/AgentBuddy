<template>
  <div class="flex flex-col h-full">
    <!-- Tabs -->
    <Tabs
      :tabs="openFiles"
      :active-tab-path="activeFilePath"
      :root-directory="rootDirectory"
      @select="selectFile"
      @close="closeFile"
      @reorder="(fromIndex, toIndex) => $emit('reorder', fromIndex, toIndex)"
      @reveal-in-explorer="(path) => $emit('reveal-in-explorer', path)"
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
        <!-- Terminal view -->
        <div v-show="isTerminal(activeFile)" class="h-full overflow-hidden">
          <TerminalView
            v-if="isTerminal(activeFile)"
            :key="activeFile.terminalInfo.id"
            :terminal-info="activeFile.terminalInfo"
            class="h-full"
          />
        </div>
        
        <!-- Monaco editor for both regular files and diffs -->
        <div v-show="!isTerminal(activeFile)" class="h-full overflow-hidden">
          <SimpleMonacoEditor
            v-if="!isTerminal(activeFile)"
            :key="activeFile.path"
            :model-value="activeFile.content"
            @update:model-value="handleContentChange"
            :file-path="activeFilePath || undefined"
            theme="vs-dark"
            :diff-mode="isDiffFile"
            :original-content="diffOriginalContent"
            :modified-content="diffModifiedContent"
            :read-only="isDiffFile"
            class="h-full"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FileCode } from 'lucide-vue-next'
import SimpleMonacoEditor from './SimpleMonacoEditor.vue'
import TerminalView from './TerminalView.vue'
import Tabs from './Tabs.vue'
import type { OpenFile, TerminalTab } from '@/plugins/code/state'
import type { ActionTab } from '@/plugins/code/features/actions/state'
import type { PromptTab } from '@/plugins/code/features/prompts/state'
import type { GitDiff } from '@/plugins/code/features/commit/state'

// Props
const props = defineProps<{
  openFiles: (OpenFile | TerminalTab | ActionTab | PromptTab)[]
  activeFilePath: string | null
  rootDirectory?: string
}>()

// Emits
const emit = defineEmits<{
  selectFile: [path: string]
  closeFile: [path: string]
  contentChange: [path: string, content: string]
  reorder: [fromIndex: number, toIndex: number]
  'reveal-in-explorer': [path: string]
}>()

// Helper to check if a file is a terminal
const isTerminal = (file: OpenFile | TerminalTab | ActionTab | PromptTab): file is TerminalTab => {
  return 'isTerminal' in file && file.isTerminal === true
}

// Helper to check if file is a diff
const isDiffFile = computed(() => {
  return activeFile.value && 'isDiff' in activeFile.value && activeFile.value.isDiff === true
})

// Get diff content
const getDiffContent = (file: any): GitDiff | null => {
  return file && 'gitDiff' in file ? file.gitDiff : null
}

// Computed
const activeFile = computed(() => 
  props.openFiles.find(f => f.path === props.activeFilePath)
)

const diffOriginalContent = computed(() => {
  if (!isDiffFile.value || !activeFile.value) return undefined
  const diff = getDiffContent(activeFile.value)
  return diff?.originalContent
})

const diffModifiedContent = computed(() => {
  if (!isDiffFile.value || !activeFile.value) return undefined
  const diff = getDiffContent(activeFile.value)
  return diff?.modifiedContent
})

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