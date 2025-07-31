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
          <span class="text-neutral-400">Collections:</span>
          <span class="font-medium text-neutral-200">{{ totalCollections }}</span>
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id, librarySystem, type LibraryContext, type LibraryEvents } from './state'
import type { ActorRefFrom } from 'xstate'

type LibraryActor = ActorRefFrom<typeof librarySystem>
const actor = applicationState.system.get(id) as LibraryActor

// Individual selectors for each context property
const documents = useSelector(actor, (state) => state.context.documents)
const collections = useSelector(actor, (state) => state.context.collections)
const selectedDocumentId = useSelector(actor, (state) => state.context.selectedDocumentId)

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
</script>