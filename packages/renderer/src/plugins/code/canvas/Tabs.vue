<template>
  <div v-if="tabs.length > 0" class="flex flex-col flex-shrink-0">
    <!-- Pinned tabs row -->
    <div 
      v-if="pinnedTabs.length > 0"
      class="flex items-center min-h-[2.5rem] overflow-x-auto overflow-y-visible pinned-tabs-container bg-neutral-900 border-b border-neutral-800"
      data-container="pinned"
      @dragover="handleContainerDragOver"
      @drop="handleContainerDrop"
      @dragleave="handleDragLeave"
    >
      <ContextMenuRoot v-for="(tab, index) in pinnedTabs" :key="tab.path">
        <ContextMenuTrigger as-child>
          <div
            class="relative flex items-center min-h-[2.5rem] border-r tab-item group border-neutral-800"
            :class="[
              activeTabPath === tab.path ? 'bg-neutral-850 border-t border-t-blue-500' : 'bg-neutral-900 hover:bg-neutral-800',
              draggedIndex === index && draggedContainer === 'pinned' ? 'opacity-50' : ''
            ]"
            :data-index="index"
            :data-container="'pinned'"
            draggable="true"
            @dragstart="handleDragStart(index, 'pinned', $event)"
            @dragend="handleDragEnd"
          >
            <!-- Drop indicator -->
            <div
              v-if="draggedIndex !== null && dropPosition.container === 'pinned' && dropPosition.index === index && dropPosition.side === 'left'"
              class="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10"
            />
            <div
              v-if="draggedIndex !== null && dropPosition.container === 'pinned' && dropPosition.index === index && dropPosition.side === 'right'"
              class="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10"
            />
            
            <button
              @click="$emit('select', tab.path)"
              class="flex items-center gap-2 py-2 px-3 text-sm transition-colors"
              :class="activeTabPath === tab.path ? 'text-neutral-100' : 'text-neutral-400'"
            >
              <component 
                :is="getTabIcon(tab)"
                class="flex-shrink-0 w-4 h-4"
              />
              <span class="max-w-[150px] truncate">{{ getTabLabel(tab) }}</span>
              <Pin v-if="tab.isPinned" class="w-3 h-3 ml-1 text-neutral-400" />
              <span v-if="!isTerminal(tab) && !tab.isDiff && tab.pendingSaveConflict" class="w-2 h-2 bg-orange-500 rounded-full"></span>
              <span v-else-if="!isTerminal(tab) && !tab.isDiff && tab.modified" class="w-2 h-2 bg-blue-500 rounded-full"></span>
            </button>
          </div>
        </ContextMenuTrigger>
        
        <ContextMenuPortal v-if="shouldShowContextMenu(tab)">
          <ContextMenuContent
            class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
          >
            <ContextMenuItem
              v-if="tab.isPinned"
              @select="unpinTab(tab)"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <Pin class="w-4 h-4" />
              Unpin tab
            </ContextMenuItem>
            
            <ContextMenuItem
              @select="copyRelativePath(tab)"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <Copy class="w-4 h-4" />
              Copy relative path
            </ContextMenuItem>
            
            <ContextMenuItem
              @select="revealInExplorer(tab)"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <FolderOpen class="w-4 h-4" />
              Reveal in explorer
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenuRoot>
    </div>

    <!-- Regular tabs row -->
    <div 
      v-if="unpinnedTabs.length > 0"
      class="flex items-center min-h-[2.5rem] overflow-x-auto overflow-y-visible tabs-container bg-neutral-900 border-b border-neutral-800"
      data-container="unpinned"
      @dragover="handleContainerDragOver"
      @drop="handleContainerDrop"
      @dragleave="handleDragLeave"
    >
      <ContextMenuRoot v-for="(tab, index) in unpinnedTabs" :key="tab.path">
        <ContextMenuTrigger as-child>
          <div
            class="relative flex items-center min-h-[2.5rem] border-r tab-item group border-neutral-800"
            :class="[
              activeTabPath === tab.path ? 'bg-neutral-850 border-t border-t-blue-500' : 'bg-neutral-900 hover:bg-neutral-800',
              draggedIndex === index && draggedContainer === 'unpinned' ? 'opacity-50' : ''
            ]"
            :data-index="index"
            :data-container="'unpinned'"
            draggable="true"
            @dragstart="handleDragStart(index, 'unpinned', $event)"
            @dragend="handleDragEnd"
          >
            <!-- Drop indicator -->
            <div
              v-if="draggedIndex !== null && dropPosition.container === 'unpinned' && dropPosition.index === index && dropPosition.side === 'left'"
              class="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10"
            />
            <div
              v-if="draggedIndex !== null && dropPosition.container === 'unpinned' && dropPosition.index === index && dropPosition.side === 'right'"
              class="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-10"
            />
            
            <button
              @click="$emit('select', tab.path)"
              class="flex items-center gap-2 py-2 px-3 text-sm transition-colors"
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
        </ContextMenuTrigger>
        
        <ContextMenuPortal v-if="shouldShowContextMenu(tab)">
          <ContextMenuContent
            class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
          >
            <ContextMenuItem
              v-if="!tab.isPinned"
              @select="pinTab(tab)"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <Pin class="w-4 h-4" />
              Pin tab
            </ContextMenuItem>
            
            <ContextMenuItem
              @select="copyRelativePath(tab)"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <Copy class="w-4 h-4" />
              Copy relative path
            </ContextMenuItem>
            
            <ContextMenuItem
              @select="revealInExplorer(tab)"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <FolderOpen class="w-4 h-4" />
              Reveal in explorer
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenuRoot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, FileCode, File, FileJson, FileText, Image, GitCompare, Terminal, Play, Sparkle, Copy, FolderOpen, Pin } from 'lucide-vue-next'
import type { OpenFile, TerminalTab } from '@/plugins/code/state'
import type { ActionTab } from '@/plugins/code/features/actions/state'
import type { PromptTab } from '@/plugins/code/features/prompts/state'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
} from 'reka-ui'

// Props
const props = defineProps<{
  tabs: (OpenFile | TerminalTab | ActionTab | PromptTab)[]
  activeTabPath: string | null
  rootDirectory?: string
}>()

// Computed properties to separate tabs
const pinnedTabs = computed(() => props.tabs.filter(tab => tab.isPinned))
const unpinnedTabs = computed(() => props.tabs.filter(tab => !tab.isPinned))

// Emits
const emit = defineEmits<{
  select: [path: string]
  close: [path: string]
  reorder: [fromIndex: number, toIndex: number]
  'reveal-in-explorer': [path: string]
  'pin-tab': [path: string]
  'unpin-tab': [path: string]
}>()

// Drag state
const draggedIndex = ref<number | null>(null)
const draggedContainer = ref<'pinned' | 'unpinned' | null>(null)
const dropPosition = ref<{ index: number | null; side: 'left' | 'right'; container: 'pinned' | 'unpinned' | null }>({ 
  index: null, 
  side: 'left',
  container: null 
})

// Helper to check if a file is a terminal
const isTerminal = (file: OpenFile | TerminalTab | ActionTab | PromptTab): file is TerminalTab => {
  return 'isTerminal' in file && file.isTerminal === true
}

// Helper to check if we should show context menu (only for regular files with real paths)
const shouldShowContextMenu = (file: OpenFile | TerminalTab | ActionTab | PromptTab): boolean => {
  // Don't show context menu for terminals, actions, or prompts
  if (isTerminal(file)) return false
  if ('isAction' in file && file.isAction) return false
  if ('isPrompt' in file && file.isPrompt) return false
  
  // Only show for files with actual file paths (not special paths like action: or prompt:)
  return !file.path.includes(':')
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
const handleDragStart = (index: number, container: 'pinned' | 'unpinned', event: DragEvent) => {
  draggedIndex.value = index
  draggedContainer.value = container
  event.dataTransfer!.effectAllowed = 'move'
  // Store both index and container in dataTransfer
  event.dataTransfer!.setData('text/plain', JSON.stringify({ index, container }))
}

const handleContainerDragOver = (event: DragEvent) => {
  if (draggedIndex.value === null) return
  
  event.preventDefault()
  event.dataTransfer!.dropEffect = 'move'
  
  // Determine which container we're over
  const containerEl = event.currentTarget as HTMLElement
  const containerType = containerEl.dataset.container as 'pinned' | 'unpinned'
  
  // Find which tab we're over
  const tabElements = Array.from(containerEl.querySelectorAll('.tab-item')) as HTMLElement[]
  const mouseX = event.clientX
  
  for (let i = 0; i < tabElements.length; i++) {
    const rect = tabElements[i].getBoundingClientRect()
    
    // Check if mouse is over this tab or in the gap after it
    if (mouseX >= rect.left && mouseX <= (tabElements[i + 1]?.getBoundingClientRect().left || rect.right + 10)) {
      const midpoint = rect.left + rect.width / 2
      const side = mouseX < midpoint ? 'left' : 'right'
      dropPosition.value = { index: i, side, container: containerType }
      return
    }
  }
  
  // If we're not over any tab but still in the container, position at the end
  if (tabElements.length === 0 && containerType) {
    dropPosition.value = { index: 0, side: 'left', container: containerType }
  }
}

const handleContainerDrop = (event: DragEvent) => {
  if (draggedIndex.value === null || dropPosition.value.index === null || !dropPosition.value.container) return
  
  event.preventDefault()
  
  const sourceContainer = draggedContainer.value!
  const targetContainer = dropPosition.value.container
  const sourceIndex = draggedIndex.value
  const dropIndex = dropPosition.value.index
  
  // Get the actual tab being moved
  const sourceTabs = sourceContainer === 'pinned' ? pinnedTabs.value : unpinnedTabs.value
  const draggedTab = sourceTabs[sourceIndex]
  
  if (!draggedTab) return
  
  // If moving between containers, handle pin/unpin
  if (sourceContainer !== targetContainer) {
    if (targetContainer === 'pinned') {
      // Moving to pinned - auto pin
      emit('pin-tab', draggedTab.path)
    } else {
      // Moving to unpinned - auto unpin
      emit('unpin-tab', draggedTab.path)
    }
  } else {
    // Same container - just reorder
    let targetIndex = dropIndex
    
    if (dropPosition.value.side === 'right') {
      targetIndex = dropIndex + 1
      if (sourceIndex < dropIndex) {
        targetIndex = dropIndex
      }
    } else {
      if (sourceIndex > dropIndex) {
        targetIndex = dropIndex
      } else {
        targetIndex = dropIndex - 1
      }
    }
    
    // Calculate the actual indices in the full tabs array
    const fullSourceIndex = props.tabs.findIndex(t => t.path === draggedTab.path)
    const targetTabs = targetContainer === 'pinned' ? pinnedTabs.value : unpinnedTabs.value
    
    if (targetIndex >= 0 && targetIndex < targetTabs.length) {
      const targetTab = targetTabs[targetIndex]
      const fullTargetIndex = props.tabs.findIndex(t => t.path === targetTab.path)
      emit('reorder', fullSourceIndex, fullTargetIndex)
    } else if (targetIndex >= targetTabs.length && targetTabs.length > 0) {
      // Dropping at the end
      const lastTab = targetTabs[targetTabs.length - 1]
      const fullTargetIndex = props.tabs.findIndex(t => t.path === lastTab.path)
      emit('reorder', fullSourceIndex, fullTargetIndex)
    }
  }
  
  // Clean up
  draggedIndex.value = null
  draggedContainer.value = null
  dropPosition.value = { index: null, side: 'left', container: null }
}

const handleDragEnd = () => {
  // Clean up in case drop didn't fire
  draggedIndex.value = null
  draggedContainer.value = null
  dropPosition.value = { index: null, side: 'left', container: null }
}

const handleDragLeave = (event: DragEvent) => {
  // Only clear if leaving the container entirely
  const container = event.currentTarget as HTMLElement
  const relatedTarget = event.relatedTarget as HTMLElement
  
  if (!container.contains(relatedTarget)) {
    dropPosition.value = { index: null, side: 'left', container: null }
  }
}

// Context menu actions
const copyRelativePath = async (tab: OpenFile | TerminalTab | ActionTab | PromptTab) => {
  try {
    let relativePath = tab.path
    
    // If rootDirectory is provided, calculate the relative path
    if (props.rootDirectory) {
      // Ensure both paths use forward slashes
      const normalizedRoot = props.rootDirectory.replace(/\\/g, '/')
      const normalizedPath = tab.path.replace(/\\/g, '/')
      
      // Remove the root directory from the path
      if (normalizedPath.startsWith(normalizedRoot)) {
        relativePath = normalizedPath.slice(normalizedRoot.length)
        // Remove leading slash if present
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1)
        }
      }
    }
    
    await navigator.clipboard.writeText(relativePath)
  } catch (err) {
    console.error('Failed to copy path to clipboard:', err)
  }
}

const revealInExplorer = (tab: OpenFile | TerminalTab | ActionTab | PromptTab) => {
  emit('reveal-in-explorer', tab.path)
}

const pinTab = (tab: OpenFile | TerminalTab | ActionTab | PromptTab) => {
  emit('pin-tab', tab.path)
}

const unpinTab = (tab: OpenFile | TerminalTab | ActionTab | PromptTab) => {
  emit('unpin-tab', tab.path)
}
</script>

<style>
.bg-neutral-850 {
  background-color: rgb(28, 28, 30);
}
</style>