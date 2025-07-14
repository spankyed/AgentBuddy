<template>
  <div class="p-4 space-y-4">
    <div>
      <h3 class="font-semibold mb-2">Library Stats</h3>
      <div class="space-y-1 text-sm">
        <div>Total Documents: {{ context.documents.length }}</div>
        <div>Total Collections: {{ totalCollections }}</div>
      </div>
    </div>
    
    <div v-if="selectedDocument">
      <h3 class="font-semibold mb-2">Selected Document</h3>
      <div class="space-y-2 text-sm">
        <div>
          <span class="font-medium">Name:</span>
          {{ selectedDocument.name }}
        </div>
        <div>
          <span class="font-medium">Tags:</span>
          <div v-if="selectedDocument.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in selectedDocument.tags"
              :key="tag"
              class="px-2 py-1 bg-gray-200 rounded text-xs"
            >
              {{ tag }}
            </span>
          </div>
          <span v-else class="text-gray-500">No tags</span>
        </div>
        <div>
          <span class="font-medium">Collection:</span>
          <span v-if="selectedDocument.collectionPath">
            {{ selectedDocument.collectionPath.join(' / ') }}
          </span>
          <span v-else class="text-gray-500">No collection</span>
        </div>
        <div>
          <span class="font-medium">Created:</span>
          {{ formatDate(selectedDocument.createdAt) }}
        </div>
        <div>
          <span class="font-medium">Updated:</span>
          {{ formatDate(selectedDocument.updatedAt) }}
        </div>
      </div>
    </div>
    
    <div>
      <h3 class="font-semibold mb-2">All Tags</h3>
      <div v-if="allTags.length > 0" class="flex flex-wrap gap-1">
        <button
          v-for="tag in allTags"
          :key="tag"
          @click="send({ type: 'FILTER_BY_TAG', tag })"
          class="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs transition-colors"
        >
          {{ tag }} ({{ tagCounts[tag] }})
        </button>
      </div>
      <div v-else class="text-sm text-gray-500">No tags yet</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import { id, type LibraryState, type LibraryContext, type LibraryEvents } from './state'

const actor: LibraryState = applicationState.system.get(id)
const context = useSelector(actor, (state) => state.context)
const send = (event: LibraryEvents) => actor.send(event)

const selectedDocument = computed(() => {
  if (!context.value.selectedDocumentId) return null
  return context.value.documents.find(doc => doc.id === context.value.selectedDocumentId)
})

const totalCollections = computed(() => {
  let count = 0
  
  function countCollections(collections: typeof context.value.collections) {
    for (const col of collections) {
      count++
      if (col.childCollections.length > 0) {
        countCollections(col.childCollections)
      }
    }
  }
  
  countCollections(context.value.collections)
  return count
})

const allTags = computed(() => {
  const tags = new Set<string>()
  context.value.documents.forEach(doc => {
    doc.tags.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
})

const tagCounts = computed(() => {
  const counts: Record<string, number> = {}
  context.value.documents.forEach(doc => {
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