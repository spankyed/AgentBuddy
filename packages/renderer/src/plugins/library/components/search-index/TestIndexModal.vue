<template>
  <teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-neutral-800 rounded-lg p-6 w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold text-neutral-100">
            Test Search: {{ testingIndex?.name }}
          </h2>
          <button
            @click="cancel"
            class="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Search Input -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-neutral-300 mb-2">
            Search Query
          </label>
          <div class="flex gap-2">
            <input
              v-model="localQuery"
              @keyup.enter="executeSearch"
              type="text"
              placeholder="Enter your search query..."
              class="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              :disabled="isSearching"
            />
            <button
              @click="executeSearch"
              :disabled="!localQuery || isSearching"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span v-if="!isSearching">Search</span>
              <span v-else>Searching...</span>
            </button>
          </div>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="testResults.length === 0 && !isSearching" class="text-center py-8 text-neutral-500">
            <Search class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Enter a query and click search to test this index</p>
          </div>

          <div v-else-if="isSearching" class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>

          <div v-else-if="testResults.length > 0" class="space-y-4">
            <!-- Results Summary -->
            <div class="flex items-center justify-between text-sm text-neutral-400 pb-2 border-b border-neutral-700">
              <span>Found {{ testResults.length }} {{ testResults.length === 1 ? 'chunk' : 'chunks' }} across {{ uniqueDocumentCount }} {{ uniqueDocumentCount === 1 ? 'document' : 'documents' }}</span>
              <div class="flex items-center gap-2">
                <button
                  @click="expandAll"
                  class="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded transition-colors"
                >
                  Expand All
                </button>
                <button
                  @click="collapseAll"
                  class="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded transition-colors"
                >
                  Collapse All
                </button>
              </div>
            </div>

            <!-- Grouped Results by Document -->
            <div v-for="[docId, chunks] in groupedResults" :key="docId" class="border border-neutral-700 rounded-lg overflow-hidden">
              <!-- Document Header -->
              <div class="px-4 py-3 bg-neutral-900/50 border-b border-neutral-700">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <FileText class="w-4 h-4 text-neutral-500" />
                    <div>
                      <h4 class="text-sm font-medium text-neutral-200">
                        {{ chunks[0].metadata?.name || `Document ${docId}` }}
                      </h4>
                      <div class="text-xs text-neutral-500 mt-0.5">
                        {{ chunks[0].metadata?.shortCode || docId }}
                      </div>
                    </div>
                  </div>
                  <div class="text-xs text-neutral-400">
                    {{ chunks.length }} {{ chunks.length === 1 ? 'chunk' : 'chunks' }} found
                  </div>
                </div>
              </div>

              <!-- Document Chunks -->
              <div class="divide-y divide-neutral-700/50">
                <div
                  v-for="(result, index) in chunks"
                  :key="`${docId}-${index}`"
                  class="p-4 hover:bg-neutral-900/30 transition-colors"
                >
                  <!-- Chunk Header -->
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-2">
                        <!-- Chunk Type Badge -->
                        <span 
                          class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                          :class="getChunkTypeBadgeClass(result.chunkInfo)"
                        >
                          <Hash class="w-3 h-3 mr-1" />
                          {{ getChunkTypeLabel(result.chunkInfo) }}
                        </span>
                        
                        <!-- Segment Info -->
                        <span v-if="result.chunkInfo" class="text-xs text-neutral-500">
                          Segment {{ result.chunkInfo.segmentIndex + 1 }}
                          <span v-if="result.chunkInfo.itemIndex !== undefined">
                            • Item {{ result.chunkInfo.itemIndex + 1 }}
                          </span>
                        </span>

                        <!-- Chunk Key -->
                        <button
                          v-if="result.chunkInfo"
                          @click="copyChunkKey(result.chunkInfo.chunkKey)"
                          class="ml-auto text-xs text-neutral-600 hover:text-neutral-400 transition-colors flex items-center gap-1"
                          :title="result.chunkInfo.chunkKey"
                        >
                          <Key class="w-3 h-3" />
                          <span class="font-mono">{{ truncateChunkKey(result.chunkInfo.chunkKey) }}</span>
                          <Copy class="w-3 h-3" />
                        </button>
                      </div>

                      <!-- Score Display -->
                      <div class="flex items-center gap-4 text-xs">
                        <div class="flex items-center gap-2">
                          <span class="text-neutral-500">Score:</span>
                          <span 
                            class="inline-flex items-center px-2 py-0.5 font-medium rounded"
                            :class="getSimilarityClass(result.score)"
                          >
                            {{ getSimilarityPercentage(result.score) }}%
                          </span>
                        </div>
                        <div class="text-neutral-600">
                          Distance: {{ result.score.toFixed(4) }}
                        </div>
                        <div class="text-neutral-600">
                          Metric: {{ testingIndex?.indexMetric || 'cosine' }}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Text Content -->
                  <div class="mt-3">
                    <div 
                      class="text-sm text-neutral-300 bg-neutral-900/50 rounded p-3 font-mono"
                      :class="{ 'cursor-pointer hover:bg-neutral-900/70': !expandedChunks.has(getChunkId(result, index)) }"
                      @click="toggleChunkExpansion(result, index)"
                    >
                      <div v-if="expandedChunks.has(getChunkId(result, index))">
                        <!-- Full text with preserved formatting -->
                        <pre class="whitespace-pre-wrap break-words">{{ result.text }}</pre>
                        <div class="flex items-center justify-between mt-3 pt-3 border-t border-neutral-700">
                          <span class="text-xs text-neutral-500">
                            {{ result.text.length }} characters
                          </span>
                          <button
                            @click.stop="copyText(result.text)"
                            class="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
                          >
                            <Copy class="w-3 h-3" />
                            Copy Text
                          </button>
                        </div>
                      </div>
                      <div v-else class="relative">
                        <!-- Truncated text -->
                        <p class="line-clamp-3">{{ result.text }}</p>
                        <div class="absolute bottom-0 right-0 bg-gradient-to-l from-neutral-900/50 to-transparent pl-8 pr-2">
                          <span class="text-xs text-blue-400">Click to expand...</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Chunk Metadata (if expanded) -->
                  <div v-if="expandedChunks.has(getChunkId(result, index)) && result.chunkInfo" class="mt-3 p-3 bg-neutral-900/30 rounded text-xs text-neutral-500">
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <span class="text-neutral-600">Total chunks in doc:</span>
                        <span class="ml-2 text-neutral-400">{{ result.chunkInfo.totalChunks }}</span>
                      </div>
                      <div>
                        <span class="text-neutral-600">Indexed at:</span>
                        <span class="ml-2 text-neutral-400">{{ formatDate(result.metadata.indexedAt) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-4 pt-4 border-t border-neutral-700 flex justify-between items-center">
          <div v-if="testResults.length > 0" class="text-xs text-neutral-500">
            Showing {{ Math.min(testResults.length, 50) }} of {{ testResults.length }} results
          </div>
          <button
            @click="cancel"
            class="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Copy Feedback Toast -->
    <Transition name="fade">
      <div v-if="showCopyFeedback" class="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
        {{ copyFeedbackMessage }}
      </div>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id, type LibraryEvents } from '../../state'
import type { ActorRefFrom } from 'xstate'
import { librarySystem } from '../../state'
import { FileText, Search, X, Hash, Key, Copy } from 'lucide-vue-next'

type LibraryActor = ActorRefFrom<typeof librarySystem>
const actor = applicationState.system.get(id) as LibraryActor

const testingIndex = useSelector(actor, (state) => state.context.testingIndex)
const testQuery = useSelector(actor, (state) => state.context.testQuery)
const testResults = useSelector(actor, (state) => state.context.testResults)
const isSearching = useSelector(actor, (state) => state.context.isSearching)

const send = (event: LibraryEvents) => actor.send(event)

const localQuery = ref('')
const expandedChunks = ref(new Set<string>())
const showCopyFeedback = ref(false)
const copyFeedbackMessage = ref('')

// Computed properties
const groupedResults = computed(() => {
  const grouped = new Map()
  for (const result of testResults.value) {
    if (!grouped.has(result.documentId)) {
      grouped.set(result.documentId, [])
    }
    grouped.get(result.documentId).push(result)
  }
  
  // Sort chunks within each document by score (lowest distance first - better matches)
  for (const [docId, chunks] of grouped) {
    chunks.sort((a: any, b: any) => a.score - b.score)
  }
  
  // Sort the documents by their best chunk's score (lowest distance first)
  const sortedGrouped = new Map(
    [...grouped.entries()].sort((a, b) => {
      const bestScoreA = a[1][0].score // First chunk after sorting has best score
      const bestScoreB = b[1][0].score
      return bestScoreA - bestScoreB // Lower distance = better match
    })
  )
  
  return sortedGrouped
})

const uniqueDocumentCount = computed(() => {
  return groupedResults.value.size
})

// Sync with state machine
watch(testQuery, (newVal) => {
  localQuery.value = newVal
})

watch(localQuery, (newVal) => {
  send({ type: 'UPDATE_TEST_QUERY', query: newVal })
})

function executeSearch() {
  if (localQuery.value && !isSearching.value) {
    expandedChunks.value.clear()
    send({ type: 'EXECUTE_TEST_SEARCH' })
  }
}

function cancel() {
  send({ type: 'CANCEL_TEST_SEARCH' })
}

function getChunkId(result: any, index: number): string {
  return `${result.documentId}-${index}`
}

function toggleChunkExpansion(result: any, index: number) {
  const chunkId = getChunkId(result, index)
  if (expandedChunks.value.has(chunkId)) {
    expandedChunks.value.delete(chunkId)
  } else {
    expandedChunks.value.add(chunkId)
  }
}

function expandAll() {
  for (const [docId, chunks] of groupedResults.value) {
    chunks.forEach((chunk: any, index: number) => {
      expandedChunks.value.add(getChunkId(chunk, index))
    })
  }
}

function collapseAll() {
  expandedChunks.value.clear()
}

function getSimilarityPercentage(score: number): string {
  // Convert distance to similarity percentage
  // For cosine distance: 0 = identical, 2 = opposite
  // For dot product: higher is better (can be negative)
  const metric = testingIndex.value?.indexMetric || 'cosine'
  let similarity: number
  
  if (metric === 'cosine') {
    similarity = Math.max(0, Math.min(100, (1 - score / 2) * 100))
  } else {
    // dot_product - normalize to 0-100 range
    similarity = Math.max(0, Math.min(100, (score + 1) * 50))
  }
  
  return similarity.toFixed(1)
}

function getSimilarityClass(score: number): string {
  const percentage = parseFloat(getSimilarityPercentage(score))
  if (percentage >= 80) return 'bg-green-500/20 text-green-400 border border-green-500/30'
  if (percentage >= 60) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  if (percentage >= 40) return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}

function getChunkTypeBadgeClass(chunkInfo: any): string {
  if (!chunkInfo) return 'bg-neutral-700 text-neutral-400'
  if (chunkInfo.chunkType === 'full') return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
  return 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
}

function getChunkTypeLabel(chunkInfo: any): string {
  if (!chunkInfo) return 'Document'
  if (chunkInfo.chunkType === 'full') return 'Full Document'
  return `Segment Item`
}

function truncateChunkKey(key: string): string {
  if (key.length <= 20) return key
  return key.substring(0, 8) + '...' + key.substring(key.length - 8)
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showCopyFeedback.value = true
    copyFeedbackMessage.value = 'Text copied to clipboard'
    setTimeout(() => {
      showCopyFeedback.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy text:', err)
  }
}

async function copyChunkKey(key: string) {
  try {
    await navigator.clipboard.writeText(key)
    showCopyFeedback.value = true
    copyFeedbackMessage.value = 'Chunk key copied'
    setTimeout(() => {
      showCopyFeedback.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy chunk key:', err)
  }
}
</script>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

pre {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
}
</style>