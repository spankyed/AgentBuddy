<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
      <div class="flex items-center gap-2">
        <Search :size="16" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200">Search</h3>
      </div>
    </div>
    
    <!-- Search Input Section -->
    <div class="p-4 border-b border-neutral-800">


      <!-- Search Options -->
      <div class="flex items-center gap-2 mb-3">
        <button
          @click="toggleOption('searchInCurrentDir')"
          :class="[
            'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
            searchOptions.searchInCurrentDir 
              ? 'bg-blue-600 text-white' 
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          ]"
          :title="searchOptions.searchInCurrentDir ? 'Searching in current directory' : 'Searching in root directory'"
        >
          <FolderOpen class="w-3 h-3" />
          <span>{{ searchOptions.searchInCurrentDir ? 'Current' : 'Root' }}</span>
        </button>
                <div class="w-px h-4 mx-1 bg-neutral-700"></div>
        <button
          @click="toggleOption('caseSensitive')"
          :class="optionButtonClass(searchOptions.caseSensitive)"
          title="Match Case"
        >
          Aa
        </button>
        <button
          @click="toggleOption('wholeWord')"
          :class="optionButtonClass(searchOptions.wholeWord)"
          title="Match Whole Word"
        >
          ab
        </button>
        <button
          @click="toggleOption('useRegex')"
          :class="optionButtonClass(searchOptions.useRegex)"
          title="Use Regular Expression"
        >
          .*
        </button>

      </div>


      <div class="flex items-center gap-2 mb-3">
        <input
          v-model="searchQuery"
          @keyup.enter="performSearch"
          type="text"
          :placeholder="searchPlaceholder"
          class="flex-1 px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
        />
        <button
          @click="performSearch"
          :disabled="!searchQuery || isSearching"
          class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded text-sm transition-colors"
        >
          {{ isSearching ? 'Searching...' : 'Search' }}
        </button>
        <button
          v-if="isSearching"
          @click="cancelSearch"
          class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
        >
          Cancel
        </button>
      </div>


      <!-- Include/Exclude Patterns -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <label class="w-20 text-xs text-neutral-400">Include:</label>
          <input
            v-model="includePattern"
            @change="updateOptions"
            type="text"
            placeholder="e.g., *.ts, *.vue"
            class="flex-1 px-2 py-1 text-xs border rounded bg-neutral-800 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="w-20 text-xs text-neutral-400">Exclude:</label>
          <input
            v-model="excludePattern"
            @change="updateOptions"
            type="text"
            placeholder="e.g., node_modules, *.test.js"
            class="flex-1 px-2 py-1 text-xs border rounded bg-neutral-800 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </div>

    <!-- Search Results Section -->
    <div class="flex-1 overflow-auto">
      <!-- Progress -->
      <div v-if="searchProgress" class="p-4 text-sm text-neutral-400">
        <div class="mb-1">Searching... {{ searchProgress.filesSearched }} files</div>
        <div v-if="searchProgress.currentFile" class="text-xs truncate text-neutral-500">
          {{ searchProgress.currentFile }}
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="searchError" class="p-4">
        <div class="text-sm text-red-400">{{ searchError }}</div>
      </div>

      <!-- Results -->
      <div v-else-if="searchResults.length > 0" class="py-2">
        <div
          v-for="result in searchResults"
          :key="result.path"
          class="mb-4"
        >
          <div
            @click="toggleResultExpanded(result.path)"
            class="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-neutral-800"
          >
            <div class="flex items-center flex-1 min-w-0 gap-2">
              <ChevronRight
                :class="[
                  'w-3 h-3 text-neutral-400 transition-transform',
                  expandedResults.has(result.path) && 'rotate-90'
                ]"
              />
              <span class="text-sm truncate text-neutral-100">{{ getRelativePath(result.path) }}</span>
              <span class="text-xs text-neutral-500">({{ result.matches.length }} matches)</span>
            </div>
          </div>
          
          <div v-if="expandedResults.has(result.path)" class="ml-6">
            <div
              v-for="(match, index) in result.matches"
              :key="`${result.path}-${index}`"
              @click="openMatch(result, index)"
              class="px-4 py-1 cursor-pointer hover:bg-neutral-800"
            >
              <div class="flex items-baseline gap-2">
                <span class="text-xs text-neutral-500 min-w-[3em]">{{ match.line }}:</span>
                <div class="overflow-hidden font-mono text-xs text-neutral-300">
                  <span>{{ match.lineText.substring(0, match.matchStart) }}</span>
                  <span class="text-yellow-200 bg-yellow-600/30">{{ match.lineText.substring(match.matchStart, match.matchEnd) }}</span>
                  <span>{{ match.lineText.substring(match.matchEnd) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- No Results -->
      <div v-else-if="searchQuery && !isSearching" class="p-4 text-center">
        <div class="text-sm text-neutral-400">No results found</div>
      </div>

      <!-- Initial State -->
      <div v-else class="p-4 text-center">
        <div class="text-sm text-neutral-400">Enter a search term to find in files</div>
      </div>
    </div>

    <!-- Results Summary -->
    <div v-if="searchResults.length > 0" class="p-2 text-xs border-t border-neutral-800 text-neutral-400">
      {{ totalMatches }} results in {{ searchResults.length }} files
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import { ChevronRight, FolderOpen, Search } from 'lucide-vue-next'

// Get actors
const codeActor: CodeState = applicationState.system.get(codeId)
const searchActor = codeActor.system.get('search')!

// State selectors
const searchQuery = ref('')
const searchResults = useSelector(searchActor, (state: any) => state.context.searchResults)
const isSearching = useSelector(searchActor, (state: any) => state.context.isSearching)
const searchError = useSelector(searchActor, (state: any) => state.context.searchError)
const searchProgress = useSelector(searchActor, (state: any) => state.context.searchProgress)
const searchOptions = useSelector(searchActor, (state: any) => state.context.searchOptions)
const rootDirectory = useSelector(codeActor, (state) => state.context.rootDirectory)
const currentDirectory = useSelector(codeActor, (state) => state.context.currentDirectory)

// Local state
const includePattern = ref(searchOptions.value.includePattern)
const excludePattern = ref(searchOptions.value.excludePattern)
const expandedResults = ref(new Set<string>())

// Computed
const totalMatches = computed(() => {
  return searchResults.value.reduce((sum, result) => sum + result.matches.length, 0)
})

const searchPlaceholder = computed(() => {
  if (searchOptions.value.searchInCurrentDir) {
    const path = currentDirectory.value
    if (!path) return 'Search in current directory'
    
    // Get relative path from root
    const relativePath = rootDirectory.value && path.startsWith(rootDirectory.value) 
      ? path.slice(rootDirectory.value.length + 1) || `~/${rootDirectory.value.split('/').pop()}`
      : path
    
    // Truncate long paths in the middle
    const maxLength = 35
    if (relativePath.length > maxLength) {
      const parts = relativePath.split('/')
      if (parts.length > 2) {
        // Build path from both ends until we exceed maxLength
        let leftParts: string[] = []
        let rightParts: string[] = []
        let leftIndex = 0
        let rightIndex = parts.length - 1
        let currentLength = 3 // for "..."
        
        // Always include first and last
        leftParts.push(parts[leftIndex++])
        rightParts.unshift(parts[rightIndex--])
        currentLength += leftParts[0].length + rightParts[0].length + 2 // +2 for slashes
        
        // Add parts from both sides while we have space
        while (leftIndex <= rightIndex && currentLength < maxLength) {
          // Try adding from left
          if (leftIndex <= rightIndex) {
            const nextLeft = parts[leftIndex]
            if (currentLength + nextLeft.length + 1 <= maxLength) {
              leftParts.push(nextLeft)
              currentLength += nextLeft.length + 1
              leftIndex++
            } else {
              break
            }
          }
          
          // Try adding from right
          if (leftIndex <= rightIndex) {
            const nextRight = parts[rightIndex]
            if (currentLength + nextRight.length + 1 <= maxLength) {
              rightParts.unshift(nextRight)
              currentLength += nextRight.length + 1
              rightIndex--
            } else {
              break
            }
          }
        }
        
        // Only show ellipsis if we actually skipped parts
        if (leftIndex <= rightIndex) {
          return `Search in ${leftParts.join('/')}/.../${rightParts.join('/')}`
        }
      }
    }
    
    return `Search in ${relativePath}`
  } else {
    return `Search in ~/${rootDirectory.value.split('/').pop()}`
  }
})

// Methods
const performSearch = () => {
  if (!searchQuery.value || isSearching.value) return
  
  // Clear previous results
  expandedResults.value.clear()
  
  searchActor?.send({ 
    type: 'search.START', 
    query: searchQuery.value 
  })
}

const cancelSearch = () => {
  searchActor?.send({ type: 'search.CANCEL' })
}

const toggleOption = (option: 'caseSensitive' | 'wholeWord' | 'useRegex' | 'searchInCurrentDir') => {
  searchActor?.send({
    type: 'search.UPDATE_OPTIONS',
    options: {
      [option]: !searchOptions.value[option]
    }
  })
}

const updateOptions = () => {
  searchActor?.send({
    type: 'search.UPDATE_OPTIONS',
    options: {
      includePattern: includePattern.value,
      excludePattern: excludePattern.value
    }
  })
}

const toggleResultExpanded = (path: string) => {
  if (expandedResults.value.has(path)) {
    expandedResults.value.delete(path)
  } else {
    expandedResults.value.add(path)
  }
}

const openMatch = (result: typeof searchResults.value[0], matchIndex: number) => {
  // Open file through explorer
  const explorerActor = codeActor.system.get('explorer')
  explorerActor?.send({
    type: 'explorer.OPEN_FILE',
    path: result.path
  })
  
  // TODO: Handle scrolling to specific match index in the editor
}

const getRelativePath = (path: string) => {
  // If searching in current directory, show paths relative to current directory
  if (searchOptions.value.searchInCurrentDir && currentDirectory.value && path.startsWith(currentDirectory.value)) {
    return path.slice(currentDirectory.value.length + 1)
  }
  // Otherwise show paths relative to root directory
  if (rootDirectory.value && path.startsWith(rootDirectory.value)) {
    return path.slice(rootDirectory.value.length + 1)
  }
  return path
}

const optionButtonClass = (active: boolean) => {
  return [
    'px-2 py-1 text-xs rounded transition-colors',
    active 
      ? 'bg-blue-600 text-white' 
      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
  ]
}

// Watch for option changes from state
watch(searchOptions, (newOptions) => {
  includePattern.value = newOptions.includePattern
  excludePattern.value = newOptions.excludePattern
})

// Auto-expand first few results
watch(searchResults, (results) => {
  // Auto-expand first 3 results
  results.slice(0, 3).forEach(result => {
    expandedResults.value.add(result.path)
  })
})
</script>