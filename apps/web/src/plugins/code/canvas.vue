<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Tabs -->
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
            :is="getFileIcon(getFileExtension(file.path))"
            class="flex-shrink-0 w-4 h-4"
          />
          <span class="max-w-[150px] truncate">{{ getFileName(file.path) }}</span>
          <span v-if="file.modified" class="w-2 h-2 bg-blue-500 rounded-full"></span>
        </button>
        <button
          @click.stop="closeFile(file.path)"
          class="p-1 mx-2 transition-all rounded-sm opacity-0 group-hover:opacity-100 hover:bg-neutral-700"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Editor Container -->
    <div class="relative flex-1 pt-2 bg-neutral-850">
      <div v-if="openFiles.length === 0" class="absolute inset-0 flex items-center justify-center">
        <div class="text-center">
          <FileCode class="w-16 h-16 mx-auto mb-4 text-neutral-600" />
          <p class="text-neutral-400">Open a file from the explorer to start editing</p>
        </div>
      </div>
      
      <div v-else-if="activeFile" class="h-full pt-2">
        <VueMonacoEditor
          :value="activeFile.content"
          @update:value="handleContentChange"
          :options="editorOptions"
          theme="vs-dark"
          :language="getLanguage(activeFilePath)"
          class="h-full"
        />
      </div>
    </div>

    <!-- Status Bar -->
    <div class="flex items-center justify-between px-4 py-1 text-xs border-t bg-neutral-850 border-neutral-800">
      <div class="flex items-center gap-4">
        <span v-if="activeFile" class="text-neutral-400">
          {{ getFileName(activeFile.path) }}
        </span>
        <span v-if="activeFile && activeFile.modified" class="text-blue-400">
          Modified
        </span>
      </div>
      <div class="flex items-center gap-4">
        <button
          v-if="activeFile && activeFile.modified"
          @click="saveFile"
          class="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from './state'
import { trpc } from '@/core/trpc'
import { X, FileCode, File, FileJson, FileText, Image } from 'lucide-vue-next'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { computed } from 'vue'

const actor: CodeState = applicationState.system.get(id)

// State selectors
const openFiles = useSelector(actor, (state) => state.context.openFiles)
const activeFilePath = useSelector(actor, (state) => state.context.activeFilePath)

// Computed
const activeFile = computed(() => 
  openFiles.value.find(f => f.path === activeFilePath.value)
)

// Monaco editor options
const editorOptions = {
  fontSize: 14,
  lineNumbers: 'on' as const,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  insertSpaces: true,
  formatOnPaste: true,
  formatOnType: true,
}

// Event handlers
const selectFile = (path: string) => {
  actor.send({ type: 'SELECT_FILE', path })
}

const closeFile = (path: string) => {
  actor.send({ type: 'CLOSE_FILE', path })
}

const handleContentChange = (value: string) => {
  if (activeFilePath.value) {
    actor.send({ 
      type: 'FILE_MODIFIED', 
      path: activeFilePath.value, 
      content: value 
    })
  }
}

const saveFile = async () => {
  if (activeFile.value) {
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'WRITE_FILE' as any,
      path: activeFile.value.path, 
      content: activeFile.value.content
    } as any)
  }
}

// Helper functions
const getFileName = (path: string) => {
  return path.split('/').pop() || path
}

const getFileExtension = (path: string) => {
  const parts = path.split('.')
  return parts.length > 1 ? parts.pop() : ''
}

const getLanguage = (path: string | null) => {
  if (!path) return 'plaintext'
  
  const ext = getFileExtension(path)
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    vue: 'html',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  }
  
  return languageMap[ext || ''] || 'plaintext'
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

// Keyboard shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  // Save file: Cmd/Ctrl + S
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    if (activeFile.value && activeFile.value.modified) {
      saveFile()
    }
  }
  
  // Close tab: Cmd/Ctrl + W
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault()
    if (activeFilePath.value) {
      closeFile(activeFilePath.value)
    }
  }
}

// Add keyboard event listener
window.addEventListener('keydown', handleKeyDown)

// Cleanup on unmount
import { onUnmounted } from 'vue'
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style>
.bg-neutral-850 {
  background-color: rgb(28, 28, 30);
}
</style>