<template>
  <div class="p-6 space-y-6 bg-neutral-900 h-full">
    <div>
      <h3 class="mb-3 text-sm font-semibold text-neutral-100">Library Stats</h3>
      <div class="space-y-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-neutral-400">Documents:</span>
          <span class="font-medium text-neutral-200">{{ documents.length }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-neutral-400">Folders:</span>
          <span class="font-medium text-neutral-200">{{ totalCollections }}</span>
        </div>
      </div>
    </div>
    
    <div class="pt-6 border-t border-neutral-800">
      <h3 class="text-sm font-semibold text-neutral-100 mb-3">Search Indices</h3>
      <div v-if="searchIndices.length > 0" class="space-y-2">
        <div v-for="index in searchIndices" :key="index.id" class="p-3 bg-neutral-800 rounded-md">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-neutral-200">{{ index.name }}</span>
                <span class="text-xs text-neutral-500">•</span>
                <span class="text-xs text-neutral-400">
                  {{ index.documentCount }} {{ getIndexedItemsLabel(index) }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1 ml-2">
              <button
                @click="send({ type: 'TEST_SEARCH_INDEX', indexId: index.id })"
                class="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                title="Test Search"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <button
                @click="send({ type: 'EDIT_SEARCH_INDEX', indexId: index.id })"
                class="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded transition-colors"
                title="Edit Index"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                @click="handleDeleteIndex(index.id, index.name)"
                class="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                title="Delete Index"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-neutral-500">
        No indices in current folder
      </div>
    </div>
    
    <div v-if="selectedDocument" class="pt-6 border-t border-neutral-800">
      <h3 class="mb-3 text-sm font-semibold text-neutral-100">Selected Document</h3>
      <div class="space-y-3 text-sm">
        <div>
          <span class="block mb-1 text-xs font-medium tracking-wider uppercase text-neutral-400">Name</span>
          <span class="text-neutral-200">{{ selectedDocument.name }}</span>
        </div>
        <div>
          <span class="block mb-1 text-xs font-medium tracking-wider uppercase text-neutral-400">Tags</span>
          <div v-if="selectedDocument.tags.length > 0" class="flex flex-wrap gap-1">
            <span
              v-for="tag in selectedDocument.tags"
              :key="tag"
              class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30"
            >
              {{ tag }}
            </span>
          </div>
          <span v-else class="text-neutral-500">No tags</span>
        </div>
        <div>
          <span class="block mb-1 text-xs font-medium tracking-wider uppercase text-neutral-400">Collection</span>
          <span v-if="selectedDocument.collectionPath" class="text-neutral-200">
            {{ selectedDocument.collectionPath.join(' / ') }}
          </span>
          <span v-else class="text-neutral-500">No collection</span>
        </div>
        <div>
          <span class="block mb-1 text-xs font-medium tracking-wider uppercase text-neutral-400">Created</span>
          <span class="text-neutral-200">{{ formatDate(selectedDocument.createdAt) }}</span>
        </div>
        <div>
          <span class="block mb-1 text-xs font-medium tracking-wider uppercase text-neutral-400">Updated</span>
          <span class="text-neutral-200">{{ formatDate(selectedDocument.updatedAt) }}</span>
        </div>
      </div>
    </div>
    
    <div class="pt-6 border-t border-neutral-800">
      <h3 class="mb-3 text-sm font-semibold text-neutral-100">All Tags</h3>
      <div v-if="allTags.length > 0" class="flex flex-wrap gap-2">
        <button
          v-for="tag in allTags"
          :key="tag"
          @click="send({ type: 'FILTER_BY_TAG', tag })"
          class="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md transition-colors bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700 hover:text-neutral-300"
        >
          {{ tag }} ({{ tagCounts[tag] }})
        </button>
      </div>
      <div v-else class="text-sm text-neutral-500">No tags yet</div>
    </div>
    
    <!-- Delete Confirmation Dialog -->
    <teleport to="body">
      <div v-if="deleteConfirm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-neutral-800 rounded-lg p-6 max-w-sm w-full mx-4">
          <h3 class="text-lg font-semibold text-neutral-100 mb-2">Delete Index</h3>
          <p class="text-sm text-neutral-400 mb-4">
            Are you sure you want to delete "{{ deleteConfirm.name }}"? This will permanently remove the index and all embeddings.
          </p>
          <div class="flex justify-end gap-2">
            <button
              @click="cancelDelete"
              class="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              @click="confirmDelete"
              class="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id, librarySystem, type LibraryContext, type LibraryEvents } from './state'
import type { ActorRefFrom } from 'xstate'
import { getModelConfig } from './config/embedding-models'

type LibraryActor = ActorRefFrom<typeof librarySystem>
const actor = applicationState.system.get(id) as LibraryActor

// Individual selectors for each context property
const documents = useSelector(actor, (state) => state.context.documents)
const collections = useSelector(actor, (state) => state.context.collections)
const selectedDocumentId = useSelector(actor, (state) => state.context.selectedDocumentId)
const searchIndices = useSelector(actor, (state) => state.context.searchIndices)
const currentFolderId = useSelector(actor, (state) => state.context.currentFolderId)

const send = (event: LibraryEvents) => actor.send(event)

const selectedDocument = computed(() => {
  if (!selectedDocumentId.value) return null
  return documents.value.find(doc => doc.id === selectedDocumentId.value)
})

const totalCollections = computed(() => {
  let count = 0
  
  function countCollections(cols: LibraryContext['collections']) {
    for (const col of cols) {
      count++
      if (col.childCollections.length > 0) {
        countCollections(col.childCollections)
      }
    }
  }
  
  countCollections(collections.value)
  return count
})

const allTags = computed(() => {
  const tags = new Set<string>()
  documents.value.forEach(doc => {
    doc.tags.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
})

const tagCounts = computed(() => {
  const counts: Record<string, number> = {}
  documents.value.forEach(doc => {
    doc.tags.forEach(tag => {
      counts[tag] = (counts[tag] || 0) + 1
    })
  })
  return counts
})

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

function getModelLabel(modelId: string): string {
  const config = getModelConfig(modelId)
  if (config) {
    return `${config.displayName} (${config.dimensions}d)`
  }
  // Fallback for unknown models
  return modelId
}

function getIndexedItemsLabel(index: any): string {
  // Check if this index uses multi-indexing (separate mode for lists/fields)
  const hasMultiIndexing = index.enableSectionIndexing && 
    index.segmentRules?.some((r: any) => 
      (r.type === 'list' || r.type === 'field') && r.indexMode === 'separate'
    )
  
  if (hasMultiIndexing) {
    return index.documentCount === 1 ? 'chunk' : 'chunks'
  }
  return index.documentCount === 1 ? 'document' : 'documents'
}

const deleteConfirm = ref({
  show: false,
  indexId: '',
  name: ''
})

function handleDeleteIndex(indexId: string, name: string) {
  deleteConfirm.value = {
    show: true,
    indexId,
    name
  }
}

function confirmDelete() {
  if (deleteConfirm.value.indexId) {
    send({ type: 'DELETE_SEARCH_INDEX', indexId: deleteConfirm.value.indexId })
  }
  cancelDelete()
}

function cancelDelete() {
  deleteConfirm.value = {
    show: false,
    indexId: '',
    name: ''
  }
}
</script>