<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-4 border-b border-neutral-800">
      <div>
        <h2 class="text-lg font-semibold text-neutral-100">
          Search Query
        </h2>
        <p class="text-sm text-neutral-500">Search index to see how it performs</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="cancel"
          variant="transparent"
        >
          Back
        </Button>
        <Button
          @click="executeSearch"
          :disabled="!localQuery || isSearching"
          variant="primary"
        >
          <span v-if="!isSearching">Search</span>
          <span v-else>Searching...</span>
        </Button>
      </div>
    </div>

    <!-- Search Input Section -->
    <div class="bg-neutral-850 border-b border-neutral-800">
      <div class="max-w-4xl mx-auto px-6 py-4">
        <input
          v-model="localQuery"
          @keyup.enter="executeSearch"
          type="text"
          placeholder="Enter your search query..."
          class="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          :disabled="isSearching"
        />
      </div>
    </div>

    <!-- Results Section -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto p-6">
        <!-- Empty State -->
        <div v-if="testResults.length === 0 && !isSearching" class="text-center py-16 text-neutral-500">
          <Search class="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Enter a query and click search to test this index</p>
        </div>

        <!-- Loading State -->
        <div v-else-if="isSearching" class="flex items-center justify-center py-16">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>

        <!-- Results -->
        <div v-else-if="testResults.length > 0" class="space-y-4">
          <!-- Results Summary -->
          <div class="flex items-center justify-between text-sm text-neutral-400 pb-2 mb-4">
            <span>Found {{ testResults.length }} {{ testResults.length === 1 ? 'chunk' : 'chunks' }} across {{ uniqueDocumentCount }} {{ uniqueDocumentCount === 1 ? 'document' : 'documents' }}</span>
            <div class="flex items-center gap-2">
              <button
                @click="expandAll"
                class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
              >
                Expand All
              </button>
              <button
                @click="collapseAll"
                class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>

          <!-- Grouped Results by Document -->
          <div v-for="[docId, chunks] in groupedResults" :key="docId" class="mb-4 border border-neutral-700 rounded-lg overflow-hidden">
            <!-- Document Header -->
            <div 
              @click="toggleDocumentExpansion(docId)"
              class="px-4 py-3 bg-neutral-850 border-b border-neutral-700 cursor-pointer hover:bg-neutral-800 transition-colors"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <ChevronRight 
                    class="w-4 h-4 text-neutral-500 transition-transform"
                    :class="{ 'rotate-90': expandedDocuments.has(docId) }"
                  />
                  <FileText class="w-4 h-4 text-neutral-500" />
                  <h4 class="text-sm font-medium text-neutral-200">
                    {{ chunks[0].metadata?.name || `Document ${docId}` }}
                    <span class="text-xs text-neutral-500 ml-2">
                      {{ chunks[0].metadata?.shortCode || docId }}
                    </span>
                  </h4>
                </div>
                <div class="text-xs text-neutral-400">
                  {{ chunks.length }} {{ chunks.length === 1 ? 'chunk' : 'chunks' }} found
                </div>
              </div>
            </div>

            <!-- Document Chunks -->
            <div v-if="expandedDocuments.has(docId)" class="divide-y divide-neutral-700/50">
              <div
                v-for="(result, index) in chunks"
                :key="`${docId}-${index}`"
                class="p-4 hover:bg-neutral-850 transition-colors cursor-pointer"
                @click="toggleChunkExpansion(result, index)"
              >
                <!-- Chunk Header -->
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2 pl-3">
                    <!-- Segment Info -->
                    <span v-if="result.chunkInfo" class="text-xs text-neutral-500">
                      Segment {{ result.chunkInfo.segmentIndex + 1 }}
                    </span>

                    <!-- Chunk Type Badge (Clickable to copy ID) -->
                    <button
                      @click.stop="copyChunkKey(result.chunkInfo?.chunkKey)"
                      class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded cursor-pointer hover:opacity-80 transition-opacity"
                      :class="getChunkTypeBadgeClass(result.chunkInfo)"
                      :title="result.chunkInfo?.chunkKey || 'Copy chunk ID'"
                    >
                      <Hash class="w-3 h-3 mr-1" />
                      {{ getItemLabel(result.chunkInfo) }}
                    </button>
                    
                    <!-- Score Badge -->
                    <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-neutral-700 text-neutral-300">
                      {{ getSimilarityPercentage(result.score) }}%
                    </span>
                  </div>

                  <!-- Action Buttons -->
                  <div class="flex items-center gap-2">
                    <!-- Status Text -->
                    <span v-if="!expandedChunks.has(getChunkId(result, index))" class="text-xs text-blue-400">
                      Click to expand
                    </span>
                    <span v-else class="text-xs text-neutral-500">
                      {{ result.text.length }} chars
                    </span>
                  </div>
                </div>
                
                <!-- Text Content and Footer -->
                <div 
                  class="bg-neutral-900 rounded p-3"
                >
                  <div class="text-sm text-neutral-300 font-mono relative">
                    <div v-if="expandedChunks.has(getChunkId(result, index))">
                      <!-- Full text with preserved formatting -->
                      <pre class="whitespace-pre-wrap break-words">{{ result.text }}</pre>
                    </div>
                    <div v-else>
                      <!-- Truncated text -->
                      <p class="line-clamp-3">{{ result.text }}</p>
                    </div>
                    
                    <!-- Copy Button (overlay at bottom right) -->
                    <button
                      @click.stop="copyText(result.text)"
                      class="absolute bottom-0 right-0 p-1 text-neutral-500 hover:text-neutral-300 bg-neutral-800/90 hover:bg-neutral-700 rounded transition-colors backdrop-blur-sm"
                      title="Copy chunk text"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                  </div>
                  
                  <!-- Footer with Metadata (only show when expanded) -->
                  <div v-if="expandedChunks.has(getChunkId(result, index))" class="mt-3 pt-3 border-t border-neutral-800">
                    <div class="flex items-center justify-between text-xs text-neutral-500">
                      <div class="flex items-center gap-3">
                        <span>Distance: {{ result.score.toFixed(4) }}</span>
                        <span class="text-neutral-700">•</span>
                        <span>Metric: {{ testingIndex?.indexMetric || 'cosine' }}</span>
                      </div>
                      <span v-if="result.metadata?.indexedAt">
                        Indexed: {{ formatDate(result.metadata.indexedAt) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Copy Feedback Toast -->
    <Transition name="fade">
      <div v-if="showCopyFeedback" class="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
        {{ copyFeedbackMessage }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id, type LibraryEvents } from '../../state'
import type { ActorRefFrom } from 'xstate'
import { librarySystem } from '../../state'
import { FileText, Search, Hash, Key, Copy, ChevronRight } from 'lucide-vue-next'
import Button from '@/core/design/button.vue'

type LibraryActor = ActorRefFrom<typeof librarySystem>
const actor = applicationState.system.get(id) as LibraryActor

const testingIndex = useSelector(actor, (state) => state.context.testingIndex)
const testQuery = useSelector(actor, (state) => state.context.testQuery)
const testResults = useSelector(actor, (state) => state.context.testResults)
const isSearching = useSelector(actor, (state) => state.context.isSearching)

const send = (event: LibraryEvents) => actor.send(event)

const localQuery = ref('')
const expandedChunks = ref(new Set<string>())
const expandedDocuments = ref(new Set<string>())
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
    expandedDocuments.value.clear()
    send({ type: 'EXECUTE_TEST_SEARCH' })
  }
}

// Auto-expand documents when results come in
watch(testResults, (newResults) => {
  if (newResults.length > 0) {
    for (const [docId] of groupedResults.value) {
      expandedDocuments.value.add(docId)
    }
  }
})

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

function toggleDocumentExpansion(docId: string) {
  if (expandedDocuments.value.has(docId)) {
    expandedDocuments.value.delete(docId)
  } else {
    expandedDocuments.value.add(docId)
  }
}

function expandAll() {
  for (const [docId, chunks] of groupedResults.value) {
    expandedDocuments.value.add(docId)
    chunks.forEach((chunk: any, index: number) => {
      expandedChunks.value.add(getChunkId(chunk, index))
    })
  }
}

function collapseAll() {
  expandedChunks.value.clear()
  expandedDocuments.value.clear()
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

function getItemLabel(chunkInfo: any): string {
  if (!chunkInfo) return 'Document'
  if (chunkInfo.chunkType === 'full') return 'Full Document'
  if (chunkInfo.itemIndex !== undefined) {
    return `Item ${chunkInfo.itemIndex + 1}`
  }
  return 'Segment'
}

function getChunkTypeLabel(chunkInfo: any): string {
  if (!chunkInfo) return 'Document'
  if (chunkInfo.chunkType === 'full') return 'Full Document'
  return `Segment Item`
}

function getSegmentLabel(chunkInfo: any): string {
  if (!chunkInfo) return 'Document'
  if (chunkInfo.chunkType === 'full') return 'Full Document'
  return `Segment ${chunkInfo.segmentIndex + 1}`
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