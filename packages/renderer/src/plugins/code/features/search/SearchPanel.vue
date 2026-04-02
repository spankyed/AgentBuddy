<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <CodePanelHeader
      :icon="Search"
      title="Search"
    >
      <template v-if="searchResults.length > 0" #toolbar>
        <div class="px-3 py-1.5 text-xs text-neutral-400">
          {{ totalMatches }} results in {{ searchResults.length }} files
        </div>
      </template>
    </CodePanelHeader>

    <!-- Show only error if no directory selected -->
    <NoDirectoryState v-if="!baseDirectory" />

    <!-- Show normal UI only when directory is selected -->
    <template v-else>
      <!-- Search Input Section -->
      <div class="p-4 border-b border-neutral-800 bg-neutral-800/50">
      <!-- Search Input with Inline Filters -->
      <div class="flex items-stretch mb-3 overflow-hidden border rounded bg-neutral-900 border-neutral-700 focus-within:border-blue-500">
        <input
          ref="searchInput"
          v-model="searchQuery"
          @keyup.enter="performSearch"
          @input="performSearch"
          type="text"
          :placeholder="searchPlaceholder"
          class="flex-1 px-3 py-1.5 text-sm bg-transparent border-none outline-none text-neutral-100 placeholder-neutral-500"
        />
        <div class="flex items-stretch">
          <button
            @click="toggleOption('caseSensitive')"
            :class="[
              'px-2 py-1.5 text-xs transition-colors border-r border-l border-neutral-700',
              searchOptions.caseSensitive
                ? 'bg-blue-600 text-white'
                : 'text-neutral-400 hover:bg-neutral-700'
            ]"
            title="Match Case"
          >
            Aa
          </button>
          <button
            @click="toggleOption('wholeWord')"
            :class="[
              'px-2 py-1.5 text-xs transition-colors border-r border-neutral-700',
              searchOptions.wholeWord
                ? 'bg-blue-600 text-white'
                : 'text-neutral-400 hover:bg-neutral-700'
            ]"
            title="Match Whole Word"
          >
            ab
          </button>
          <button
            @click="toggleOption('useRegex')"
            :class="[
              'px-2 py-1.5 text-xs transition-colors',
              searchOptions.useRegex
                ? 'bg-blue-600 text-white'
                : 'text-neutral-400 hover:bg-neutral-700'
            ]"
            title="Use Regular Expression"
          >
            .*
          </button>
        </div>
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
            class="flex-1 px-2 py-1 text-xs border rounded bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="w-20 text-xs text-neutral-400">Exclude:</label>
          <input
            v-model="excludePattern"
            @change="updateOptions"
            type="text"
            placeholder="e.g., node_modules, *.test.js"
            class="flex-1 px-2 py-1 text-xs border rounded bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
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
              @click="openMatch(result)"
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
      <EmptyState
        v-else-if="searchQuery && !isSearching"
        :icon="Search"
        title="No results found"
        subtitle="Try a different search term"
      />

      <!-- Initial State -->
      <EmptyState
        v-else
        :icon="Search"
        title="Search files"
        subtitle="Enter a search term to find in files"
      />
    </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as codeId, type CodeState } from '@/plugins/code/state'
import { ChevronRight, Search } from 'lucide-vue-next'
import CodePanelHeader from '@/plugins/code/features/CodePanelHeader.vue'
import NoDirectoryState from '@/plugins/code/features/NoDirectoryState.vue'
import EmptyState from '@/plugins/code/features/EmptyState.vue'

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
const baseDirectory = useSelector(codeActor, (state) => state.context.baseDirectory)

const searchInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => {
    searchInput.value?.focus()
  })
})

// Local state
const includePattern = ref(searchOptions.value.includePattern)
const excludePattern = ref(searchOptions.value.excludePattern)
const expandedResults = ref(new Set<string>())

// Computed
const totalMatches = computed(() => {
  return searchResults.value.reduce((sum: number, result: any) => sum + result.matches.length, 0)
})

const isNoDirectoryError = computed(() => {
  return searchError.value?.includes('No directory selected')
})

const searchPlaceholder = computed(() => {
  return baseDirectory.value
    ? `Search in ~/${baseDirectory.value.split('/').pop()}`
    : 'Search in project'
})

// Methods
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const performSearch = () => {
  // Cancel any pending debounce
  if (searchTimeout) clearTimeout(searchTimeout)

  if (!searchQuery.value) {
    // Immediate: cancel in-flight + clear
    searchActor?.send({ type: 'search.CANCEL' })
    searchActor?.send({ type: 'search.CLEAR' })
    expandedResults.value.clear()
    return
  }

  // Debounce actual search
  searchTimeout = setTimeout(() => {
    expandedResults.value.clear()
    searchActor?.send({ type: 'search.START', query: searchQuery.value })
  }, 300)
}

const cancelSearch = () => {
  searchActor?.send({ type: 'search.CANCEL' })
}

const toggleOption = (option: 'caseSensitive' | 'wholeWord' | 'useRegex') => {
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

const openMatch = (result: typeof searchResults.value[0]) => {
  // Open file through explorer
  const explorerActor = codeActor.system.get('explorer')
  explorerActor?.send({
    type: 'explorer.OPEN_FILE',
    path: result.path
  })

  // TODO: Handle scrolling to specific match index in the editor
}

const getRelativePath = (path: string) => {
  if (baseDirectory.value && path.startsWith(baseDirectory.value)) {
    return path.slice(baseDirectory.value.length + 1)
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
  results.slice(0, 3).forEach((result: any) => {
    expandedResults.value.add(result.path)
  })
})
</script>

