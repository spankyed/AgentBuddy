<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="flex items-center gap-1 p-2 border-b border-neutral-800">
      <button
        v-for="panel in panels"
        :key="panel.id"
        @click="selectPanel(panel.id)"
        :class="[
          'p-1.5 rounded transition-colors',
          selectedPanel === panel.id
            ? 'bg-neutral-700 text-neutral-100'
            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
        ]"
        :title="panel.label"
      >
        <component :is="panel.icon" class="w-4 h-4" />
      </button>
    </div>

    <!-- Panel Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Explorer Panel -->
      <div v-if="selectedPanel === 'explorer'" class="h-full flex flex-col">
        <div class="p-2 border-b border-neutral-800">
          <div class="flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap">
            <span
              v-for="(segment, index) in directorySegments"
              :key="index"
              class="flex items-center flex-shrink-0"
            >
              <button
                @click="navigateToSegment(index)"
                class="px-1 py-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-all"
                :class="{ 'font-medium text-neutral-200': index === directorySegments.length - 1 }"
              >
                {{ segment.name }}
              </button>
              <span v-if="index < directorySegments.length - 1" class="text-neutral-600 mx-0.5">/</span>
            </span>
          </div>
        </div>
        
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
          <div class="text-sm text-neutral-400">Loading...</div>
        </div>
        
        <div v-else-if="error" class="flex-1 p-4">
          <div class="text-sm text-red-400">{{ error }}</div>
        </div>
        
        <div v-else class="flex-1 overflow-auto">
          <div
            v-for="file in files"
            :key="file.path"
            @click="handleFileClick(file)"
            class="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-neutral-800 transition-colors"
          >
            <component 
              :is="file.type === 'directory' ? Folder : getFileIcon(file.extension)"
              class="w-4 h-4 flex-shrink-0"
              :class="file.type === 'directory' ? 'text-blue-400' : 'text-neutral-400'"
            />
            <span class="text-sm text-neutral-200 truncate">{{ file.name }}</span>
            <span v-if="file.type === 'file' && file.size" class="text-xs text-neutral-500 ml-auto">
              {{ formatFileSize(file.size) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Search Panel -->
      <div v-else-if="selectedPanel === 'search'" class="h-full p-4">
        <div class="text-sm text-neutral-400">Search functionality coming soon...</div>
      </div>

      <!-- Commit Panel -->
      <div v-else-if="selectedPanel === 'commit'" class="h-full p-4">
        <div class="text-sm text-neutral-400">Git commit functionality coming soon...</div>
      </div>

      <!-- PR Panel -->
      <div v-else-if="selectedPanel === 'pr'" class="h-full p-4">
        <div class="text-sm text-neutral-400">Pull request functionality coming soon...</div>
      </div>
    </div>

    <!-- Change Directory Button -->
    <div class="p-2 border-t border-neutral-800">
      <button
        @click="changeDirectory"
        class="w-full px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
      >
        Change Directory
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from './state'
import { trpc } from '@/core/trpc'
import { 
  FolderOpen, 
  Search, 
  GitCommit, 
  GitPullRequest,
  Folder,
  File,
  FileCode,
  FileJson,
  FileText,
  Image
} from 'lucide-vue-next'

const actor: CodeState = applicationState.system.get(id)

// State selectors
const currentDirectory = useSelector(actor, (state) => state.context.currentDirectory)
const files = useSelector(actor, (state) => state.context.files)
const isLoading = useSelector(actor, (state) => state.context.isLoading)
const error = useSelector(actor, (state) => state.context.error)
const selectedPanel = useSelector(actor, (state) => state.context.selectedPanel)

// Panel configuration
const panels = [
  { id: 'explorer', label: 'Explorer', icon: FolderOpen },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'commit', label: 'Commit Changes', icon: GitCommit },
  { id: 'pr', label: 'Pull Request', icon: GitPullRequest }
] as const

// Computed properties
const directorySegments = computed(() => {
  const path = currentDirectory.value
  if (!path || path === '.') return [{ name: '.', path: '.' }]
  
  // Handle absolute paths
  const isAbsolute = path.startsWith('/')
  const segments = path.split('/').filter(Boolean)
  
  const result: Array<{ name: string; path: string }> = []
  let currentPath = isAbsolute ? '' : '.'
  
  // Add root for absolute paths
  if (isAbsolute) {
    result.push({ name: '/', path: '/' })
  } else if (path !== '.') {
    result.push({ name: '.', path: '.' })
  }
  
  // Build up the path segments
  segments.forEach((segment, index) => {
    currentPath = isAbsolute 
      ? (index === 0 ? `/${segment}` : `${currentPath}/${segment}`)
      : (currentPath === '.' ? segment : `${currentPath}/${segment}`)
    result.push({ name: segment, path: currentPath })
  })
  
  return result
})

// Event handlers
const selectPanel = (panel: 'explorer' | 'search' | 'commit' | 'pr') => {
  actor.send({ type: 'SELECT_PANEL', panel })
}

const navigateToSegment = async (index: number) => {
  const segment = directorySegments.value[index]
  if (segment && segment.path !== currentDirectory.value) {
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'CHANGE_DIRECTORY' as any,
      path: segment.path
    } as any)
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'LIST_FILES' as any,
      path: segment.path
    } as any)
  }
}

const handleFileClick = async (file: typeof files.value[0]) => {
  if (file.type === 'directory') {
    // Change to the directory
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'CHANGE_DIRECTORY' as any,
      path: file.path
    } as any)
    // List files in the new directory
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'LIST_FILES' as any,
      path: file.path
    } as any)
  } else {
    // Read the file content
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'READ_FILE' as any,
      path: file.path
    } as any)
  }
}

const changeDirectory = async () => {
  // TODO: Implement directory picker dialog
  const newPath = prompt('Enter directory path:', currentDirectory.value)
  if (newPath && newPath !== currentDirectory.value) {
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'CHANGE_DIRECTORY' as any,
      path: newPath
    } as any)
    await trpc.bus.send.mutate({
      systemId: id as any,
      type: 'LIST_FILES' as any,
      path: newPath
    } as any)
  }
}

// Helper functions
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

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Request initial file list when plugin is activated
onMounted(() => {
  // Request initial file list
  trpc.bus.send.mutate({
    systemId: id as any,
    type: 'LIST_FILES' as any,
    path: currentDirectory.value
  } as any)
})
</script>