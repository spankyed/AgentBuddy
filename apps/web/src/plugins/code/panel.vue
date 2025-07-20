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
              <ContextMenuRoot>
                <ContextMenuTrigger as-child>
                  <button
                    @click="navigateToSegment(index)"
                    class="px-2 py-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-all"
                    :class="{ 
                      'font-medium text-neutral-200': index === directorySegments.length - 1
                    }"
                    :title="segment.path"
                  >
                    {{ segment.name }}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuPortal>
                  <ContextMenuContent
                    class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
                  >
                    <ContextMenuItem
                      @select="() => setAsRoot(segment.path)"
                      class="px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer focus:bg-neutral-800 focus:outline-none"
                    >
                      Set as Root Directory
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuPortal>
              </ContextMenuRoot>
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
import { computed, onMounted, ref } from 'vue'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type CodeState } from './state'
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
  Image,
  Home,
  HardDrive
} from 'lucide-vue-next'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'

const actor: CodeState = applicationState.system.get(id)

// State selectors
const currentDirectory = useSelector(actor, (state) => state.context.currentDirectory)
const rootDirectory = useSelector(actor, (state) => state.context.rootDirectory)
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
  const current = currentDirectory.value
  const root = rootDirectory.value
  
  if (!current) return []
  
  // Normalize paths
  const normalizedCurrent = current.endsWith('/') && current.length > 1 
    ? current.slice(0, -1) 
    : current
  const normalizedRoot = root.endsWith('/') && root.length > 1 
    ? root.slice(0, -1) 
    : root
    
  const result: Array<{ name: string; path: string; isClickable: boolean }> = []
  
  // Check if current directory is within the root
  if (normalizedCurrent.startsWith(normalizedRoot)) {
    // Add root as ~
    const rootName = normalizedRoot.split('/').filter(Boolean).pop() || '/'
    result.push({ name: `~/${rootName}`, path: normalizedRoot, isClickable: true })
    
    // Get the relative path from root
    const relativePath = normalizedCurrent.slice(normalizedRoot.length)
    if (relativePath && relativePath !== '/') {
      const segments = relativePath.split('/').filter(Boolean)
      let currentPath = normalizedRoot
      
      segments.forEach((segment) => {
        currentPath = currentPath + '/' + segment
        result.push({ name: segment, path: currentPath, isClickable: true })
      })
    }
  } else {
    // Current is outside root, show full path
    if (normalizedCurrent.startsWith('/')) {
      result.push({ name: '/', path: '/', isClickable: true })
      const segments = normalizedCurrent.slice(1).split('/').filter(Boolean)
      segments.forEach((segment, index) => {
        const segmentPath = '/' + segments.slice(0, index + 1).join('/')
        result.push({ name: segment, path: segmentPath, isClickable: true })
      })
    } else {
      result.push({ name: '.', path: '.', isClickable: true })
    }
  }
  
  return result
})

// Event handlers
const selectPanel = (panel: 'explorer' | 'search' | 'commit' | 'pr') => {
  actor.send({ type: 'SELECT_PANEL', panel })
}

const navigateToSegment = (index: number) => {
  const segment = directorySegments.value[index]
  if (segment && segment.path !== currentDirectory.value) {
    actor.send({ type: 'NAVIGATE_TO_DIRECTORY', path: segment.path })
  }
}

const setAsRoot = (path: string) => {
  // Send event to state machine - it will handle the API calls
  actor.send({ type: 'SET_ROOT_DIRECTORY', path })
}

const handleFileClick = (file: typeof files.value[0]) => {
  if (file.type === 'directory') {
    actor.send({ type: 'NAVIGATE_TO_DIRECTORY', path: file.path })
  } else {
    actor.send({ type: 'OPEN_FILE', path: file.path })
  }
}

const changeDirectory = () => {
  const newPath = prompt('Enter directory path:', currentDirectory.value)
  if (newPath && newPath !== currentDirectory.value) {
    actor.send({ type: 'REQUEST_DIRECTORY_CHANGE', path: newPath })
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

// Plugin activation is handled by the state machine
onMounted(() => {
  actor.send({ type: 'PLUGIN_ACTIVATED' })
})
</script>