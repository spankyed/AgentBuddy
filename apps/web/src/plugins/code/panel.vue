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
      <div v-if="selectedPanel === 'explorer'" class="flex flex-col h-full">
        <div class="p-2 border-b border-neutral-800">
          <div class="flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
            <span
              v-for="(segment, index) in directorySegments"
              :key="index"
              class="flex items-center flex-shrink-0"
            >
              <ContextMenuRoot>
                <ContextMenuTrigger as-child>
                  <button
                    @click="navigateToSegment(segment.path)"
                    class="px-2 py-1 transition-all rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                    :class="{ 
                      'font-medium text-neutral-200': segment.path === currentDirectory
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
                      class="px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
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
        
        <div v-if="isLoading" class="flex items-center justify-center flex-1">
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
            class="flex items-center gap-2 px-4 py-1 transition-colors cursor-pointer hover:bg-neutral-800"
          >
            <component 
              :is="file.type === 'directory' ? Folder : getFileIcon(file.extension)"
              class="flex-shrink-0 w-4 h-4"
              :class="file.type === 'directory' ? 'text-blue-400' : 'text-neutral-400'"
            />
            <span class="text-sm truncate text-neutral-200">{{ file.name }}</span>
            <span v-if="file.type === 'file' && file.size" class="ml-auto text-xs text-neutral-500">
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
const rootDirectory = useSelector(actor, (state) => state.context.rootDirectory)
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
  const root = rootDirectory.value
  const current = currentDirectory.value
  
  if (!root || !current) return []
  
  // Normalize paths - remove trailing slashes except for root "/"
  const normalizedRoot = root.endsWith('/') && root.length > 1 
    ? root.slice(0, -1) 
    : root
  const normalizedCurrent = current.endsWith('/') && current.length > 1 
    ? current.slice(0, -1) 
    : current
    
  const result: Array<{ name: string; path: string }> = []
  
  // Get root directory name
  const rootName = normalizedRoot.split('/').filter(Boolean).pop() || '/'
  
  // If current is within root, show relative path
  if (normalizedCurrent.startsWith(normalizedRoot)) {
    // Add root segment
    result.push({ name: `~/${rootName}`, path: normalizedRoot })
    
    // Add path segments from root to current
    const relativePath = normalizedCurrent.slice(normalizedRoot.length)
    if (relativePath) {
      const segments = relativePath.split('/').filter(Boolean)
      let currentPath = normalizedRoot
      
      segments.forEach(segment => {
        currentPath = currentPath + '/' + segment
        result.push({ name: segment, path: currentPath })
      })
    }
  } else {
    // Current is outside root, show full path
    result.push({ name: '/', path: '/' })
    const segments = normalizedCurrent.slice(1).split('/').filter(Boolean)
    let currentPath = ''
    
    segments.forEach(segment => {
      currentPath = currentPath + '/' + segment
      result.push({ name: segment, path: currentPath })
    })
  }
  
  return result
})

// Event handlers
const selectPanel = (panel: 'explorer' | 'search' | 'commit' | 'pr') => {
  actor.send({ type: 'SELECT_PANEL', panel })
}

const navigateToSegment = (path: string) => {
  if (path !== currentDirectory.value) {
    actor.send({ type: 'NAVIGATE_TO_DIRECTORY', path })
  }
}

const setAsRoot = (path: string) => {
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
  const newPath = prompt('Enter new root directory path:', rootDirectory.value)
  if (newPath && newPath !== rootDirectory.value) {
    actor.send({ type: 'SET_ROOT_DIRECTORY', path: newPath })
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