<template>
  <teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-neutral-800 rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold text-neutral-100">
            Test Search: {{ testingIndex?.name }}
          </h2>
          <button
            @click="cancel"
            class="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
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
            <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p>Enter a query and click search to test this index</p>
          </div>

          <div v-else-if="isSearching" class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>

          <div v-else-if="testResults.length > 0" class="space-y-3">
            <div class="text-sm text-neutral-400 mb-2">
              Found {{ testResults.length }} results
            </div>
            <div
              v-for="(result, index) in testResults"
              :key="index"
              class="p-4 bg-neutral-900 rounded-lg border border-neutral-700"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                  <h4 class="text-sm font-medium text-neutral-200 mb-1">
                    {{ result.metadata?.name || `Document ${result.documentId}` }}
                  </h4>
                  <div class="text-xs text-neutral-500">
                    {{ result.metadata?.shortCode || result.documentId }}
                  </div>
                </div>
                <div class="ml-4">
                  <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md"
                        :class="getSimilarityClass(result.score)">
                    {{ getSimilarityPercentage(result.score) }}% match
                  </span>
                </div>
              </div>
              
              <div class="mt-3 text-sm text-neutral-400">
                <p class="line-clamp-3">{{ result.text }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-4 pt-4 border-t border-neutral-700 flex justify-end">
          <button
            @click="cancel"
            class="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id, type LibraryEvents } from '../../state'
import type { ActorRefFrom } from 'xstate'
import { librarySystem } from '../../state'

type LibraryActor = ActorRefFrom<typeof librarySystem>
const actor = applicationState.system.get(id) as LibraryActor

const testingIndex = useSelector(actor, (state) => state.context.testingIndex)
const testQuery = useSelector(actor, (state) => state.context.testQuery)
const testResults = useSelector(actor, (state) => state.context.testResults)
const isSearching = useSelector(actor, (state) => state.context.isSearching)

const send = (event: LibraryEvents) => actor.send(event)

const localQuery = ref('')

// Sync with state machine
watch(testQuery, (newVal) => {
  localQuery.value = newVal
})

watch(localQuery, (newVal) => {
  send({ type: 'UPDATE_TEST_QUERY', query: newVal })
})

function executeSearch() {
  if (localQuery.value && !isSearching.value) {
    send({ type: 'EXECUTE_TEST_SEARCH' })
  }
}

function cancel() {
  send({ type: 'CANCEL_TEST_SEARCH' })
}

function getSimilarityPercentage(score: number): string {
  // Convert distance to similarity percentage
  // Lower distance = higher similarity
  // Assuming cosine distance ranges from 0 to 2
  const similarity = Math.max(0, Math.min(100, (1 - score / 2) * 100))
  return similarity.toFixed(1)
}

function getSimilarityClass(score: number): string {
  const similarity = (1 - score / 2) * 100
  if (similarity >= 80) return 'bg-green-500/20 text-green-400 border border-green-500/30'
  if (similarity >= 60) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  if (similarity >= 40) return 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}
</script>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>