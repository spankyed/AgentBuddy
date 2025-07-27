<template>
  <Transition name="quick-open">
    <div
      v-if="isVisible"
      class="fixed inset-0 z-50 flex items-start justify-center pt-20"
      @click.self="handleClose"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50" />
      
      <!-- Palette -->
      <div class="relative w-full max-w-2xl mx-4">
        <div class="bg-neutral-900 rounded-lg shadow-2xl border border-neutral-800 overflow-hidden">
          <!-- Search Input -->
          <div class="flex items-center px-4 py-3 border-b border-neutral-800">
            <Search class="w-4 h-4 text-neutral-500 mr-3 flex-shrink-0" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              placeholder="Search files by name..."
              class="flex-1 bg-transparent text-neutral-100 placeholder-neutral-500 outline-none text-sm"
              @input="handleSearch"
              @keydown="handleKeydown"
            />
            <kbd class="ml-3 px-2 py-1 text-xs bg-neutral-800 text-neutral-400 rounded">
              ESC
            </kbd>
          </div>
          
          <!-- Results -->
          <div
            v-if="loading"
            class="px-4 py-8 text-center text-neutral-500 text-sm"
          >
            Loading files...
          </div>
          
          <div
            v-else-if="filteredResults.length === 0 && searchQuery"
            class="px-4 py-8 text-center text-neutral-500 text-sm"
          >
            No files found matching "{{ searchQuery }}"
          </div>
          
          <div
            v-else-if="filteredResults.length > 0"
            ref="resultsContainer"
            class="max-h-96 overflow-y-auto"
          >
            <div
              v-for="(result, index) in filteredResults"
              :key="result.item.path"
              :ref="el => setResultRef(el, index)"
              class="px-4 py-2 flex items-center gap-3 hover:bg-neutral-800 cursor-pointer transition-colors"
              :class="{ 'bg-neutral-800': index === selectedIndex }"
              @click="handleSelect(index)"
              @mouseenter="selectedIndex = index"
            >
              <!-- File Icon -->
              <component
                :is="getFileIcon(result.item)"
                class="w-4 h-4 text-neutral-500 flex-shrink-0"
              />
              
              <!-- File Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <!-- File Name with Highlighting -->
                  <span
                    class="text-sm text-neutral-100 truncate"
                    v-html="highlightedName(result)"
                  />
                  
                  <!-- File Path -->
                  <span class="text-xs text-neutral-500 truncate">
                    {{ getDirectory(result.item.relativePath) }}
                  </span>
                </div>
              </div>
              
              <!-- Score (for debugging, remove in production) -->
              <!-- <span class="text-xs text-neutral-600">
                {{ result.score.toFixed(2) }}
              </span> -->
            </div>
          </div>
          
          <div
            v-else
            class="px-4 py-8 text-center text-neutral-500 text-sm"
          >
            Start typing to search files...
          </div>
          
          <!-- Footer -->
          <div class="px-4 py-2 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
            <div class="flex items-center gap-4">
              <span class="flex items-center gap-1">
                <kbd class="px-1.5 py-0.5 bg-neutral-800 rounded">↑</kbd>
                <kbd class="px-1.5 py-0.5 bg-neutral-800 rounded">↓</kbd>
                Navigate
              </span>
              <span class="flex items-center gap-1">
                <kbd class="px-1.5 py-0.5 bg-neutral-800 rounded">↵</kbd>
                Open
              </span>
            </div>
            <span v-if="filteredResults.length > 0">
              {{ filteredResults.length }} results
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { id as codeId, type CodeState, type QuickOpenResult } from '@/plugins/code/state'
import { fuzzySearch, highlightMatches } from '@/plugins/code/utils/fuzzy-search'
import { 
  Search, FileCode, FileText, FileJson, Image, 
  Video, FileArchive, FileType, Folder 
} from 'lucide-vue-next'

// Get state
const codeActor: CodeState = applicationState.system.get(codeId)

// State selectors
const isVisible = useSelector(codeActor, (state) => state.context.isQuickOpenVisible)
const results = useSelector(codeActor, (state) => state.context.quickOpenResults)
const loading = useSelector(codeActor, (state) => state.context.quickOpenLoading)
const selectedIndex = useSelector(codeActor, (state) => state.context.quickOpenSelectedIndex)

// Local state
const searchInput = ref<HTMLInputElement>()
const resultsContainer = ref<HTMLDivElement>()
const searchQuery = ref('')
const resultRefs = ref<(HTMLElement | null)[]>([])

// Computed filtered results
const filteredResults = computed(() => {
  if (!searchQuery.value.trim()) {
    // Show recent files or all files when no query
    return results.value.slice(0, 20).map(item => ({
      item,
      score: 0,
      positions: [],
      matchRanges: []
    }))
  }
  
  return fuzzySearch(
    searchQuery.value,
    results.value,
    (item) => item.relativePath,
    50 // Max results
  )
})

// Methods
const handleClose = () => {
  codeActor.send({ type: 'HIDE_QUICK_OPEN' })
}

const handleSearch = () => {
  codeActor.send({ 
    type: 'UPDATE_QUICK_OPEN_QUERY', 
    query: searchQuery.value 
  })
}

const handleSelect = (index: number) => {
  codeActor.send({ type: 'SELECT_QUICK_OPEN_RESULT', index })
  codeActor.send({ type: 'OPEN_QUICK_OPEN_RESULT' })
}

const handleKeydown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'Escape':
      e.preventDefault()
      handleClose()
      break
      
    case 'ArrowDown':
      e.preventDefault()
      if (filteredResults.value.length > 0) {
        const newIndex = Math.min(selectedIndex.value + 1, filteredResults.value.length - 1)
        codeActor.send({ type: 'SELECT_QUICK_OPEN_RESULT', index: newIndex })
        scrollToSelected(newIndex)
      }
      break
      
    case 'ArrowUp':
      e.preventDefault()
      if (filteredResults.value.length > 0) {
        const newIndex = Math.max(selectedIndex.value - 1, 0)
        codeActor.send({ type: 'SELECT_QUICK_OPEN_RESULT', index: newIndex })
        scrollToSelected(newIndex)
      }
      break
      
    case 'Enter':
      e.preventDefault()
      if (filteredResults.value.length > 0) {
        handleSelect(selectedIndex.value)
      }
      break
  }
}

const scrollToSelected = (index: number) => {
  nextTick(() => {
    const element = resultRefs.value[index]
    if (element && resultsContainer.value) {
      const container = resultsContainer.value
      const elementTop = element.offsetTop
      const elementBottom = elementTop + element.offsetHeight
      const containerTop = container.scrollTop
      const containerBottom = containerTop + container.clientHeight
      
      if (elementTop < containerTop) {
        container.scrollTop = elementTop
      } else if (elementBottom > containerBottom) {
        container.scrollTop = elementBottom - container.clientHeight
      }
    }
  })
}

const setResultRef = (el: any, index: number) => {
  resultRefs.value[index] = el
}

const getFileIcon = (file: QuickOpenResult) => {
  if (file.type === 'directory') return Folder
  
  const ext = file.extension?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'vue':
      return FileCode
    case 'json':
    case 'jsonc':
      return FileJson
    case 'md':
    case 'txt':
      return FileText
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return Image
    case 'mp4':
    case 'avi':
    case 'mov':
      return Video
    case 'zip':
    case 'tar':
    case 'gz':
      return FileArchive
    default:
      return FileType
  }
}

const getDirectory = (relativePath: string) => {
  const lastSlash = relativePath.lastIndexOf('/')
  if (lastSlash === -1) return ''
  return relativePath.substring(0, lastSlash)
}

const highlightedName = (result: any) => {
  if (result.matchRanges.length === 0) {
    return result.item.name
  }
  
  // Adjust match ranges to be relative to the filename, not the full path
  const pathPrefixLength = result.item.relativePath.length - result.item.name.length
  const adjustedRanges = result.matchRanges
    .map(([start, end]: [number, number]) => [
      Math.max(0, start - pathPrefixLength),
      Math.max(0, end - pathPrefixLength)
    ])
    .filter(([start, end]: [number, number]) => start < result.item.name.length)
    .map(([start, end]: [number, number]) => [
      start,
      Math.min(end, result.item.name.length)
    ])
  
  return highlightMatches(
    result.item.name,
    adjustedRanges,
    'text-blue-400 font-semibold'
  )
}

// Focus input when visible
watch(isVisible, (visible) => {
  if (visible) {
    searchQuery.value = ''
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
})

// Reset selected index when results change
watch(filteredResults, () => {
  codeActor.send({ type: 'SELECT_QUICK_OPEN_RESULT', index: 0 })
})

// Global escape key handler
const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isVisible.value) {
    e.preventDefault()
    handleClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
/* Transition for smooth appearance */
.quick-open-enter-active,
.quick-open-leave-active {
  transition: all 0.2s ease;
}

.quick-open-enter-from,
.quick-open-leave-to {
  opacity: 0;
}

.quick-open-enter-from > div:last-child,
.quick-open-leave-to > div:last-child {
  transform: scale(0.95) translateY(-10px);
}

/* Custom scrollbar for results */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #525252;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #737373;
}
</style>