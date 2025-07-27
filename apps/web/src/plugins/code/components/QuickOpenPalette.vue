<template>
  <Transition name="quick-open">
    <div
      v-if="isVisible"
      class="absolute inset-0 z-50 flex items-start justify-center pt-20 -top-10"
      @click.self="handleClose"
    >
      <!-- Palette -->
      <div class="relative w-full max-w-2xl mx-4">
        <div class="overflow-hidden border rounded-lg shadow-2xl bg-neutral-900 border-neutral-800">
          <!-- Search Input -->
          <div class="flex items-center px-4 py-3 border-b border-neutral-800">
            <Search class="flex-shrink-0 w-4 h-4 mr-3 text-neutral-500" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              placeholder="Search files by name..."
              class="flex-1 text-sm bg-transparent outline-none text-neutral-100 placeholder-neutral-500"
              @input="handleSearch"
              @keydown="handleKeydown"
            />
            <kbd class="px-2 py-1 ml-3 text-xs rounded bg-neutral-800 text-neutral-400">
              ESC
            </kbd>
          </div>
          
          <!-- Results -->
          <div
            v-if="loading"
            class="px-4 py-8 text-sm text-center text-neutral-500"
          >
            Loading files...
          </div>
          
          <div
            v-else-if="filteredResults.length === 0 && searchQuery"
            class="px-4 py-8 text-sm text-center text-neutral-500"
          >
            No files found matching "{{ searchQuery }}"
          </div>
          
          <div
            v-else-if="filteredResults.length > 0"
            ref="resultsContainer"
            class="overflow-y-auto max-h-96"
          >
            <div
              v-for="(result, index) in filteredResults"
              :key="result.item.path"
              :ref="el => setResultRef(el, index)"
              class="flex items-center gap-3 px-4 py-2 transition-colors cursor-pointer hover:bg-neutral-800"
              :class="{ 'bg-neutral-800': index === selectedIndex }"
              @click="handleSelect(index)"
              @mouseenter="selectedIndex = index"
            >
              <!-- File Icon -->
              <component
                :is="getFileIcon(result.item)"
                class="flex-shrink-0 w-4 h-4 text-neutral-500"
              />
              
              <!-- File Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <!-- File Name with Highlighting -->
                  <span
                    class="text-sm truncate text-neutral-100"
                    v-html="highlightedName(result)"
                  />
                  
                  <!-- Recent/Open Indicators -->
                  <div class="flex items-center gap-1">
                    <span
                      v-if="result.isOpen"
                      class="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded"
                    >
                      open
                    </span>
                    <span
                      v-else-if="result.isRecent"
                      class="px-1.5 py-0.5 text-xs bg-neutral-700 text-neutral-400 rounded flex items-center gap-1"
                    >
                      <Clock class="w-3 h-3" />
                      recent
                    </span>
                  </div>
                  
                  <!-- File Path -->
                  <span class="text-xs truncate text-neutral-500">
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
            class="px-4 py-8 text-sm text-center text-neutral-500"
          >
            Start typing to search files...
          </div>
          
          <!-- Footer -->
          <div class="flex items-center justify-between px-4 py-2 text-xs border-t border-neutral-800 text-neutral-500">
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
import { getRecencyScore } from '@/plugins/code/utils/recent-files'
import { 
  Search, FileCode, FileText, FileJson, Image, 
  Video, FileArchive, FileType, Folder, Clock 
} from 'lucide-vue-next'

// Type for enhanced search results
interface EnhancedSearchResult {
  item: QuickOpenResult
  score: number
  positions: number[]
  matchRanges: Array<[number, number]>
  isRecent?: boolean
  isOpen?: boolean
}

// Get state
const codeActor: CodeState = applicationState.system.get(codeId)

// State selectors
const isVisible = useSelector(codeActor, (state) => state.context.isQuickOpenVisible)
const results = useSelector(codeActor, (state) => state.context.quickOpenResults)
const loading = useSelector(codeActor, (state) => state.context.quickOpenLoading)
const selectedIndex = useSelector(codeActor, (state) => state.context.quickOpenSelectedIndex)
const recentlyOpenedFiles = useSelector(codeActor, (state) => state.context.recentlyOpenedFiles)
const openFiles = useSelector(codeActor, (state) => state.context.openFiles)

// Local state
const searchInput = ref<HTMLInputElement>()
const resultsContainer = ref<HTMLDivElement>()
const searchQuery = ref('')
const resultRefs = ref<(HTMLElement | null)[]>([])

// Computed filtered results
const filteredResults = computed<EnhancedSearchResult[]>(() => {
  if (!searchQuery.value.trim()) {
    // When no query, show recent files first
    const openFilePaths = openFiles.value.map(f => f.path)
    const recentResults: any[] = []
    const otherResults: any[] = []
    
    // First, add currently open files
    const openFileResults: EnhancedSearchResult[] = results.value
      .filter(item => openFilePaths.includes(item.path))
      .map(item => ({
        item,
        score: 20000, // Very high score for open files
        positions: [],
        matchRanges: [],
        isOpen: true
      }))
    
    // Then add recent files (excluding already open ones)
    const recentFileResults: EnhancedSearchResult[] = recentlyOpenedFiles.value
      .filter(path => !openFilePaths.includes(path))
      .map(path => results.value.find(item => item.path === path))
      .filter((item): item is QuickOpenResult => item !== undefined)
      .slice(0, 10) // Show top 10 recent files
      .map((item, index) => ({
        item,
        score: 10000 - index * 100, // High score for recent files
        positions: [],
        matchRanges: [],
        isRecent: true
      }))
    
    // Finally, add other files
    const shownPaths = [...openFilePaths, ...recentlyOpenedFiles.value]
    const otherFileResults: EnhancedSearchResult[] = results.value
      .filter(item => !shownPaths.includes(item.path))
      .slice(0, 20)
      .map(item => ({
        item,
        score: 0,
        positions: [],
        matchRanges: []
      }))
    
    return [...openFileResults, ...recentFileResults, ...otherFileResults]
  }
  
  // Search with both full path and filename for better results
  const searchResults = fuzzySearch(
    searchQuery.value,
    results.value,
    (item) => item.relativePath,
    100, // Get more results initially
    (item) => item.name // Pass filename for exact match detection
  )
  
  // If we have exact filename matches, prioritize them heavily
  const query = searchQuery.value.toLowerCase()
  return searchResults
    .map(result => {
      let score = result.score
      
      // Extra boost for exact filename match
      if (result.item.name.toLowerCase() === query) {
        score += 10000
      }
      // Boost for filename starting with query
      else if (result.item.name.toLowerCase().startsWith(query)) {
        score += 5000
      }
      
      // Add recency score
      const recencyScore = getRecencyScore(recentlyOpenedFiles.value, result.item.path)
      score += recencyScore
      
      // Mark if it's a recent file
      const isRecent = recentlyOpenedFiles.value.includes(result.item.path)
      const isOpen = openFiles.value.some(f => f.path === result.item.path)
      
      return { 
        ...result, 
        score,
        isRecent,
        isOpen
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50) // Return top 50
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
  transition: opacity 0.15s ease;
}

.quick-open-enter-from,
.quick-open-leave-to {
  opacity: 0;
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